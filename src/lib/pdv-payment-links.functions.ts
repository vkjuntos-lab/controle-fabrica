import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";

/**
 * Onda F: cria link de pagamento via driver plugável (MP/Asaas).
 * A landing /pay/:code continua chamando `ensurePublicPreference` para
 * fluxo cliente-primeiro.
 */

function buildBaseUrl(): string {
  const host = getRequestHost();
  const proto = host?.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function webhookUrlFor(provider: string): string {
  const base = buildBaseUrl();
  if (provider === "asaas") return `${base}/api/public/asaas-webhook`;
  if (provider === "pagbank") return `${base}/api/public/pagbank-webhook`;
  if (provider === "pagarme") return `${base}/api/public/pagarme-webhook`;
  return `${base}/api/public/mp-webhook?secret=${encodeURIComponent(process.env.MP_WEBHOOK_SECRET ?? "")}`;
}

/* ---------- Autenticado (criado pelo operador) ---------- */
export const createMPPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { linkId: string }) => z.object({ linkId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { data: link, error } = await supabase
      .from("payment_links")
      .select("id, code, description, amount, methods, max_installments, status, store_id, mp_preference_id, mp_init_point, provider, splits")
      .eq("id", data.linkId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!link) throw new Error("Link não encontrado.");
    if (link.status !== "pending") throw new Error(`Link está ${link.status}.`);

    if (link.mp_preference_id && link.mp_init_point) {
      return { preferenceId: link.mp_preference_id, initPoint: link.mp_init_point };
    }

    // Onda L — antifraude antes de gerar preferência
    {
      const { evaluateTransaction } = await import("@/lib/fraud/engine.server");
      const fraud = await evaluateTransaction({
        sourceType: "payment_link", sourceId: link.id, storeId: link.store_id,
        amount: Number(link.amount),
      });
      if (fraud.action === "block") {
        throw new Error(`Cobrança bloqueada pelo antifraude: ${fraud.reasons.map(r => r.ruleName).join("; ")}`);
      }
    }

    const { resolveDriver } = await import("@/lib/gateways/registry.server");
    const { normalizeSplits } = await import("@/lib/gateways/split.server");
    const driver = await resolveDriver(link.store_id);
    const baseUrl = buildBaseUrl();
    const methods = Array.isArray(link.methods) ? (link.methods as any[]) : ["pix", "credit", "debit"];

    const result = await driver.createCheckoutLink({
      amount: Number(link.amount),
      description: link.description || `Cobrança ${link.code}`,
      externalRef: `link:${link.id}`,
      notificationUrl: webhookUrlFor(driver.provider),
      returnUrl: `${baseUrl}/pay/${link.code}`,
      maxInstallments: link.max_installments ?? 1,
      splits: normalizeSplits(link.splits),
    }, methods as any);

    await supabase
      .from("payment_links")
      .update({
        provider: driver.provider,
        mp_preference_id: result.providerId,
        mp_init_point: result.initPoint,
      })
      .eq("id", link.id);

    return { preferenceId: result.providerId, initPoint: result.initPoint, publicUrl: `${baseUrl}/pay/${link.code}` };
  });

/* ---------- Público (landing) ---------- */
export const resolvePaymentLink = createServerFn({ method: "GET" })
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(4).max(24) }).parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabasePublic = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await supabasePublic.rpc("resolve_payment_link", { _code: data.code });
    if (error) throw new Error(error.message);
    const row = ((rows as any[]) ?? [])[0];
    if (!row) throw new Error("Link não encontrado.");
    return row as {
      id: string; code: string; description: string; amount: number;
      methods: string[]; max_installments: number;
      status: "pending" | "paid" | "expired" | "canceled";
      expires_at: string | null; customer_name: string | null;
      store_name: string; mp_init_point: string | null;
      provider: "mercadopago" | "asaas" | "pagbank" | "pagarme";
    };
  });

export const ensurePublicPreference = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(4).max(24) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: link } = await admin
      .from("payment_links")
      .select("id, code, description, amount, methods, max_installments, status, store_id, mp_preference_id, mp_init_point, expires_at, provider, splits")
      .eq("code", data.code)
      .maybeSingle();
    if (!link) throw new Error("Link não encontrado.");
    if (link.status !== "pending") throw new Error(`Link ${link.status}`);
    if (link.expires_at && new Date(link.expires_at) < new Date()) throw new Error("Link expirado");
    if (link.mp_preference_id && link.mp_init_point) {
      return { initPoint: link.mp_init_point, preferenceId: link.mp_preference_id };
    }

    const { resolveDriver } = await import("@/lib/gateways/registry.server");
    const { normalizeSplits } = await import("@/lib/gateways/split.server");
    const driver = await resolveDriver(link.store_id);
    const baseUrl = buildBaseUrl();
    const methods = Array.isArray(link.methods) ? (link.methods as any[]) : ["pix", "credit", "debit"];

    const result = await driver.createCheckoutLink({
      amount: Number(link.amount),
      description: link.description || `Cobrança ${link.code}`,
      externalRef: `link:${link.id}`,
      notificationUrl: webhookUrlFor(driver.provider),
      returnUrl: `${baseUrl}/pay/${link.code}`,
      maxInstallments: link.max_installments ?? 1,
      splits: normalizeSplits(link.splits),
    }, methods as any);

    await admin.from("payment_links").update({
      provider: driver.provider,
      mp_preference_id: result.providerId,
      mp_init_point: result.initPoint,
    }).eq("id", link.id);

    return { initPoint: result.initPoint, preferenceId: result.providerId };
  });
