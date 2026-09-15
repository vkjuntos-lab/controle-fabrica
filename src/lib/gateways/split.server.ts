// Onda K — helpers de split/marketplace.
// - normalizeSplits: parseia/valida regras vindas do cliente.
// - materializeSplitEntries: cria linhas em payment_split_entries após aprovação.
import type { SplitRule } from "./types";

export function normalizeSplits(raw: unknown): SplitRule[] {
  if (!Array.isArray(raw)) return [];
  const out: SplitRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, any>;
    const pct = Number(r.percentage ?? r.percentualValue ?? 0);
    const fixed = Number(r.fixedAmount ?? r.fixedValue ?? 0);
    if ((!pct || pct <= 0) && (!fixed || fixed <= 0)) continue;
    out.push({
      recipientCustomerId: r.recipientCustomerId ?? r.recipient_customer_id ?? null,
      recipientName: r.recipientName ?? r.recipient_name ?? null,
      asaasWalletId: r.asaasWalletId ?? r.asaas_wallet_id ?? null,
      mpCollectorId: r.mpCollectorId ?? r.mp_collector_id ?? null,
      percentage: pct > 0 ? Math.min(100, pct) : null,
      fixedAmount: fixed > 0 ? fixed : null,
      description: r.description ?? null,
    });
  }
  return out;
}

/** Calcula valor em BRL para cada regra dado o total pago. */
export function computeSplitAmount(rule: SplitRule, total: number): number {
  if (rule.fixedAmount && rule.fixedAmount > 0) return Math.min(total, Number(rule.fixedAmount));
  if (rule.percentage && rule.percentage > 0) return Number(((total * rule.percentage) / 100).toFixed(2));
  return 0;
}

/**
 * Insere `payment_split_entries` para cada regra, com status:
 *  - 'applied' quando o gateway processa nativamente (Asaas com walletId)
 *  - 'pending' quando o repasse depende de ação externa (MP marketplace)
 */
export async function materializeSplitEntries(input: {
  sourceType: "payment_link" | "pix_charge";
  sourceId: string;
  storeId: string;
  provider: string;
  providerRef?: string | null;
  totalAmount: number;
  splits: unknown;
}): Promise<void> {
  const rules = normalizeSplits(input.splits);
  if (rules.length === 0) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  // Idempotência: se já existem entries para essa cobrança, não duplicar.
  const { data: existing } = await admin
    .from("payment_split_entries")
    .select("id")
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .limit(1);
  if (existing && existing.length > 0) return;

  const rows = rules.map(r => {
    const amount = computeSplitAmount(r, input.totalAmount);
    const nativelyApplied = input.provider === "asaas" && !!r.asaasWalletId;
    return {
      source_type: input.sourceType,
      source_id: input.sourceId,
      store_id: input.storeId,
      recipient_customer_id: r.recipientCustomerId ?? null,
      recipient_name: r.recipientName ?? null,
      provider: input.provider,
      provider_ref: input.providerRef ?? null,
      amount,
      percentage: r.percentage ?? null,
      status: nativelyApplied ? "applied" : "pending",
    };
  }).filter(r => Number(r.amount) > 0);

  if (rows.length === 0) return;
  const { error } = await admin.from("payment_split_entries").insert(rows);
  if (error) console.error("[split] insert entries falhou:", error.message);
}
