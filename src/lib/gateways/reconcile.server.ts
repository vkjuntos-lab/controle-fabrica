// Onda J — Reconciliação financeira.
// Percorre payment_links e pix_charges pendentes que tenham um provider_id
// registrado, consulta o gateway (driver.getStatus) e, se o status já mudou,
// aplica via applyWebhookUpdate. Fallback caso o webhook do provedor falhe.

import type { GatewayProvider, PaymentGatewayDriver, ProviderStatus, WebhookParsed } from "./types";
import { buildDriver } from "./registry.server";
import { applyWebhookUpdate } from "./webhook-apply.server";

export interface ReconcileSummary {
  scanned: number;
  updated: number;
  errors: number;
  details: Array<{
    kind: "payment_link" | "pix_charge";
    id: string;
    provider: string;
    provider_id: string;
    old_status: string;
    new_status: ProviderStatus | "unchanged" | "error";
    error?: string;
  }>;
}

const MAX_AGE_DAYS = 7; // não perde tempo com cobranças muito antigas

/** Constrói driver a partir de payment_gateways ou fallback de env. */
async function driverFor(
  admin: any,
  storeId: string | null,
  provider: GatewayProvider,
): Promise<PaymentGatewayDriver | null> {
  if (storeId) {
    const { data } = await admin
      .from("payment_gateways")
      .select("provider, config, active")
      .eq("store_id", storeId)
      .eq("provider", provider)
      .eq("active", true)
      .maybeSingle();
    if (data) {
      return buildDriver({
        storeId,
        provider,
        sandbox: !!data.config?.sandbox,
        config: (data.config ?? {}) as Record<string, any>,
      });
    }
  }
  if (provider === "mercadopago") {
    return buildDriver({
      storeId: null,
      provider: "mercadopago",
      sandbox: false,
      config: {
        access_token: process.env.MP_ACCESS_TOKEN,
        webhook_secret: process.env.MP_WEBHOOK_SECRET,
      },
    });
  }
  return null;
}

/** Reconcilia um único registro. Retorna o novo status (ou 'unchanged'). */
async function reconcileOne(
  admin: any,
  kind: "payment_link" | "pix_charge",
  row: { id: string; store_id: string | null; provider: string | null; provider_id: string; old_status: string; externalRef: string; amount: number },
  summary: ReconcileSummary,
) {
  summary.scanned++;
  const providerId = row.provider_id;
  const providerName = (row.provider ?? "mercadopago") as GatewayProvider;
  try {
    const driver = await driverFor(admin, row.store_id, providerName);
    if (!driver) {
      summary.details.push({
        kind, id: row.id, provider: providerName, provider_id: providerId,
        old_status: row.old_status, new_status: "error",
        error: `Sem driver ativo (${providerName})`,
      });
      summary.errors++;
      return;
    }
    const status = await driver.getStatus(providerId);
    if (status === "pending") {
      summary.details.push({
        kind, id: row.id, provider: providerName, provider_id: providerId,
        old_status: row.old_status, new_status: "unchanged",
      });
      return;
    }
    // Precisa aplicar. Monta WebhookParsed sintético.
    const parsed: WebhookParsed = {
      providerId,
      status,
      externalRef: row.externalRef,
      amount: Number(row.amount),
      method: null,
      installments: null,
      raw: { source: "reconcile" },
    };
    await applyWebhookUpdate(parsed);
    summary.updated++;
    summary.details.push({
      kind, id: row.id, provider: providerName, provider_id: providerId,
      old_status: row.old_status, new_status: status,
    });
  } catch (e) {
    summary.errors++;
    summary.details.push({
      kind, id: row.id, provider: providerName, provider_id: providerId,
      old_status: row.old_status, new_status: "error",
      error: (e as Error).message,
    });
  }
}

export interface RunReconciliationOpts {
  /** Restringe a uma única loja (opcional). */
  storeId?: string | null;
  /** Limita a quantidade total de registros consultados. */
  limit?: number;
}

export async function runReconciliation(opts: RunReconciliationOpts = {}): Promise<ReconcileSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const summary: ReconcileSummary = { scanned: 0, updated: 0, errors: 0, details: [] };
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 3600_000).toISOString();

  // Payment links
  let plQ = admin.from("payment_links")
    .select("id, store_id, provider, mp_payment_id, status, amount")
    .eq("status", "pending")
    .not("mp_payment_id", "is", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.storeId) plQ = plQ.eq("store_id", opts.storeId);
  const { data: links, error: eL } = await plQ;
  if (eL) throw new Error(`payment_links: ${eL.message}`);
  for (const r of (links ?? []) as any[]) {
    await reconcileOne(admin, "payment_link", {
      id: r.id, store_id: r.store_id, provider: r.provider,
      provider_id: String(r.mp_payment_id),
      old_status: r.status, externalRef: `link:${r.id}`, amount: Number(r.amount),
    }, summary);
  }

  // Pix charges (status pending ou reminded)
  let pxQ = admin.from("pix_charges")
    .select("id, store_id, provider, mp_payment_id, status, amount")
    .in("status", ["pending", "reminded"])
    .not("mp_payment_id", "is", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.storeId) pxQ = pxQ.eq("store_id", opts.storeId);
  const { data: pix, error: eP } = await pxQ;
  if (eP) throw new Error(`pix_charges: ${eP.message}`);
  for (const r of (pix ?? []) as any[]) {
    await reconcileOne(admin, "pix_charge", {
      id: r.id, store_id: r.store_id, provider: r.provider,
      provider_id: String(r.mp_payment_id),
      old_status: r.status, externalRef: `pix:${r.id}`, amount: Number(r.amount),
    }, summary);
  }

  // Auditoria resumida (uma linha por execução)
  try {
    await admin.from("audit_log").insert({
      actor_user_id: null, actor_name: "Reconcile cron", actor_role: "system",
      store_id: opts.storeId ?? null,
      action: "gateway.reconcile",
      entity: "system",
      entity_id: null,
      details: {
        scanned: summary.scanned,
        updated: summary.updated,
        errors: summary.errors,
      },
    });
  } catch { /* */ }

  return summary;
}
