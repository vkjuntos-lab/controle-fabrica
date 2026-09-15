import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions para cobranças PIX via driver plugável (Onda F).
 * Persistência em pix_charges + coluna `provider` que identifica o driver
 * usado — assim getStatus/cancel sabem para qual gateway ir.
 */

type AnyClient = { from: (t: string) => any; rpc: (n: string, args?: any) => any };
const DEFAULT_EXPIRY_MIN = 30;

function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D+/g, "");
}
function isoInFuture(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/* ============================================================
 * Criar cobrança PIX
 * ============================================================ */
const splitRuleSchema = z.object({
  recipientCustomerId: z.string().uuid().nullish(),
  recipientName: z.string().nullish(),
  asaasWalletId: z.string().nullish(),
  mpCollectorId: z.string().nullish(),
  percentage: z.number().min(0).max(100).nullish(),
  fixedAmount: z.number().min(0).nullish(),
  description: z.string().nullish(),
});

const createSchema = z.object({
  storeId: z.string().uuid(),
  sessionId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  saleCode: z.string().min(3).max(40),
  amount: z.number().positive().max(50_000),
  customerPhone: z.string().min(10),
  customerName: z.string().trim().min(1).max(120).optional(),
  cartSnapshot: z.record(z.string(), z.any()).optional(),
  parentChargeId: z.string().uuid().nullable().optional(),
  splits: z.array(splitRuleSchema).max(20).optional(),
});

export const createPixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof createSchema>) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const userId = (context as any).userId as string;

    const phoneDigits = onlyDigits(data.customerPhone);
    if (phoneDigits.length < 10) throw new Error("Telefone do cliente inválido.");

    // Onda L — avaliação antifraude antes de emitir
    {
      let cpf: string | null = null;
      let customerCreatedAt: string | null = null;
      if (data.customerId) {
        const { data: cust } = await supabase.from("customers").select("cpf, created_at").eq("id", data.customerId).maybeSingle();
        cpf = cust?.cpf ?? null;
        customerCreatedAt = cust?.created_at ?? null;
      }
      const { evaluateTransaction } = await import("@/lib/fraud/engine.server");
      const fraud = await evaluateTransaction({
        sourceType: "pix_charge",
        sourceId: data.saleCode,
        storeId: data.storeId,
        cpf, phone: phoneDigits, amount: data.amount, customerCreatedAt,
      });
      if (fraud.action === "block") {
        throw new Error(`Cobrança bloqueada pelo antifraude: ${fraud.reasons.map(r => r.ruleName).join("; ")}`);
      }
    }

    const expiresAt = isoInFuture(DEFAULT_EXPIRY_MIN);
    const { resolveDriver } = await import("@/lib/gateways/registry.server");
    const driver = await resolveDriver(data.storeId);

    const pix = await driver.createPix({
      amount: data.amount,
      description: `PDV ${data.saleCode}`,
      externalRef: data.saleCode,
      expiresAt,
      customer: { name: data.customerName ?? null, phone: phoneDigits },
      splits: data.splits ?? undefined,
    });

    const { data: inserted, error } = await supabase
      .from("pix_charges")
      .insert({
        store_id: data.storeId,
        session_id: data.sessionId ?? null,
        customer_id: data.customerId ?? null,
        operator_user_id: userId,
        sale_code: data.saleCode,
        amount: data.amount,
        cart_snapshot: data.cartSnapshot ?? {},
        customer_phone: phoneDigits,
        provider: driver.provider,
        mp_payment_id: pix.providerId,
        mp_qr_code: pix.qrCode,
        mp_qr_code_base64: pix.qrCodeBase64,
        mp_ticket_url: pix.ticketUrl,
        status: "pending",
        parent_charge_id: data.parentChargeId ?? null,
        expires_at: pix.expiresAt,
        splits: data.splits ?? null,
      } as any)
      .select("id, status, expires_at, mp_qr_code, mp_qr_code_base64, mp_ticket_url, mp_payment_id, provider")
      .single();

    if (error) throw new Error("Falha ao registrar cobrança: " + error.message);

    try {
      await supabase.rpc("log_audit", {
        _action: "pix.create",
        _entity: "pix_charge",
        _entity_id: inserted.id,
        _store_id: data.storeId,
        _details: {
          amount: data.amount, sale_code: data.saleCode,
          provider: driver.provider, provider_payment_id: pix.providerId,
          parent: data.parentChargeId ?? null,
        },
      });
    } catch { /* ignore */ }

    return {
      id: inserted.id as string,
      status: inserted.status as string,
      qrCode: inserted.mp_qr_code as string,
      qrCodeBase64: (inserted.mp_qr_code_base64 as string) ?? null,
      ticketUrl: (inserted.mp_ticket_url as string) ?? null,
      expiresAt: inserted.expires_at as string,
      mpPaymentId: inserted.mp_payment_id as string,
      provider: (inserted.provider as string) ?? driver.provider,
    };
  });

/* ============================================================
 * Consultar status
 * ============================================================ */
const statusSchema = z.object({ id: z.string().uuid() });

async function driverForCharge(storeId: string, provider: string) {
  const { buildDriver, resolveDriver } = await import("@/lib/gateways/registry.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("payment_gateways")
    .select("provider, config, active")
    .eq("store_id", storeId)
    .eq("provider", provider)
    .eq("active", true)
    .maybeSingle();
  if (data) {
    return buildDriver({
      storeId, provider: data.provider,
      sandbox: !!data.config?.sandbox, config: data.config ?? {},
    });
  }
  // fallback (MP env)
  return resolveDriver(storeId);
}

export const getPixChargeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof statusSchema>) => statusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: row, error } = await supabase
      .from("pix_charges")
      .select("id, store_id, status, mp_payment_id, expires_at, updated_at, approved_at, provider")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Cobrança não encontrada.");

    if (row.status === "pending" && row.mp_payment_id) {
      try {
        const driver = await driverForCharge(row.store_id, row.provider || "mercadopago");
        const s = await driver.getStatus(row.mp_payment_id);
        if (s === "approved") {
          await supabase.from("pix_charges")
            .update({ status: "approved", approved_at: new Date().toISOString() })
            .eq("id", row.id);
          row.status = "approved";
        } else if (s === "cancelled" || s === "expired") {
          await supabase.from("pix_charges")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", row.id);
          row.status = "cancelled";
        }
      } catch (e) {
        console.warn("[pix] fallback status falhou:", (e as Error).message);
      }
    }

    return {
      id: row.id as string,
      status: row.status as string,
      expiresAt: row.expires_at as string,
      approvedAt: (row.approved_at as string) ?? null,
    };
  });

/* ============================================================
 * Cancelar cobrança
 * ============================================================ */
export const cancelPixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof statusSchema>) => statusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: row } = await supabase
      .from("pix_charges")
      .select("id, mp_payment_id, store_id, status, provider")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Cobrança não encontrada.");
    if (row.status === "approved") throw new Error("PIX já aprovado, não pode cancelar.");

    if (row.mp_payment_id) {
      try {
        const driver = await driverForCharge(row.store_id, row.provider || "mercadopago");
        await driver.cancel(row.mp_payment_id);
      } catch (e) {
        console.warn("[pix] cancel provider:", (e as Error).message);
      }
    }
    await supabase
      .from("pix_charges")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.id);

    try {
      await supabase.rpc("log_audit", {
        _action: "pix.cancel", _entity: "pix_charge", _entity_id: data.id,
        _store_id: row.store_id, _details: {},
      });
    } catch { /* */ }
    return { ok: true };
  });

/* ============================================================
 * Regenerar cobrança
 * ============================================================ */
export const regeneratePixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof statusSchema>) => statusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const userId = (context as any).userId as string;

    const { data: old, error } = await supabase
      .from("pix_charges").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!old) throw new Error("Cobrança original não encontrada.");
    if (old.status === "approved") throw new Error("PIX já foi pago.");

    await supabase.from("pix_charges").update({ status: "regenerated" }).eq("id", old.id);

    if (old.mp_payment_id) {
      try {
        const driver = await driverForCharge(old.store_id, old.provider || "mercadopago");
        await driver.cancel(old.mp_payment_id);
      } catch { /* */ }
    }

    const expiresAt = isoInFuture(DEFAULT_EXPIRY_MIN);
    const { resolveDriver } = await import("@/lib/gateways/registry.server");
    const driver = await resolveDriver(old.store_id);
    const pix = await driver.createPix({
      amount: Number(old.amount),
      description: `PDV ${old.sale_code} (reemitido)`,
      externalRef: old.sale_code,
      expiresAt,
      customer: { phone: old.customer_phone },
    });

    const { data: inserted, error: insErr } = await supabase
      .from("pix_charges")
      .insert({
        store_id: old.store_id,
        session_id: old.session_id,
        customer_id: old.customer_id,
        operator_user_id: userId,
        sale_code: old.sale_code,
        amount: old.amount,
        cart_snapshot: old.cart_snapshot,
        customer_phone: old.customer_phone,
        provider: driver.provider,
        mp_payment_id: pix.providerId,
        mp_qr_code: pix.qrCode,
        mp_qr_code_base64: pix.qrCodeBase64,
        mp_ticket_url: pix.ticketUrl,
        status: "pending",
        parent_charge_id: old.id,
        expires_at: pix.expiresAt,
      })
      .select("id, mp_qr_code, mp_qr_code_base64, mp_ticket_url, expires_at, mp_payment_id, status, provider")
      .single();
    if (insErr) throw new Error(insErr.message);

    try {
      await supabase.rpc("log_audit", {
        _action: "pix.regenerate", _entity: "pix_charge", _entity_id: inserted.id,
        _store_id: old.store_id, _details: { parent: old.id, provider: driver.provider },
      });
    } catch { /* */ }

    return {
      id: inserted.id as string,
      status: inserted.status as string,
      qrCode: inserted.mp_qr_code as string,
      qrCodeBase64: (inserted.mp_qr_code_base64 as string) ?? null,
      ticketUrl: (inserted.mp_ticket_url as string) ?? null,
      expiresAt: inserted.expires_at as string,
      mpPaymentId: inserted.mp_payment_id as string,
      provider: (inserted.provider as string) ?? driver.provider,
    };
  });

/* ============================================================
 * Lista pendentes (mantido)
 * ============================================================ */
export const listPixReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data, error } = await supabase
      .from("pix_charges")
      .select("id, sale_code, amount, customer_phone, status, expires_at, reminded_at, created_at, mp_ticket_url")
      .in("status", ["reminded", "pending"])
      .order("expires_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string; sale_code: string; amount: number; customer_phone: string;
      status: string; expires_at: string; reminded_at: string | null;
      created_at: string; mp_ticket_url: string | null;
    }>;
  });
