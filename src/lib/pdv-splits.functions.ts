// Onda K — server functions de gestão de recebedores e relatório de repasses.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

/* ---------- Recebedores (customers.is_recipient) ---------- */
export const listRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, cpf, phone, asaas_wallet_id, mp_collector_id, is_recipient")
      .eq("is_recipient", true)
      .order("name", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string; name: string; cpf: string; phone: string | null;
      asaas_wallet_id: string | null; mp_collector_id: string | null; is_recipient: boolean;
    }>;
  });

const searchSchema = z.object({ q: z.string().trim().min(1).max(80) });
export const searchCustomersForRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof searchSchema>) => searchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const q = data.q.replace(/[%_]/g, "");
    const digits = q.replace(/\D+/g, "");
    let query = supabase.from("customers").select("id, name, cpf, phone, is_recipient").limit(20);
    query = digits.length >= 3
      ? query.or(`cpf.ilike.%${digits}%,phone.ilike.%${digits}%,name.ilike.%${q}%`)
      : query.ilike("name", `%${q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ id: string; name: string; cpf: string; phone: string | null; is_recipient: boolean }>;
  });

const upsertSchema = z.object({
  customerId: z.string().uuid(),
  isRecipient: z.boolean(),
  asaasWalletId: z.string().trim().max(120).nullable().optional(),
  mpCollectorId: z.string().trim().max(120).nullable().optional(),
});
export const upsertRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof upsertSchema>) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const patch: Record<string, any> = { is_recipient: data.isRecipient };
    if (data.asaasWalletId !== undefined) patch.asaas_wallet_id = data.asaasWalletId || null;
    if (data.mpCollectorId !== undefined) patch.mp_collector_id = data.mpCollectorId || null;
    const { error } = await supabase.from("customers").update(patch).eq("id", data.customerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Regras de split anexadas a uma cobrança ---------- */
const attachSchema = z.object({
  linkId: z.string().uuid(),
  splits: z.array(z.object({
    recipientCustomerId: z.string().uuid().nullish(),
    recipientName: z.string().nullish(),
    asaasWalletId: z.string().nullish(),
    mpCollectorId: z.string().nullish(),
    percentage: z.number().min(0).max(100).nullish(),
    fixedAmount: z.number().min(0).nullish(),
    description: z.string().nullish(),
  })).max(20),
});
export const attachSplitsToLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof attachSchema>) => attachSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: link, error } = await supabase
      .from("payment_links")
      .select("id, status, mp_preference_id")
      .eq("id", data.linkId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!link) throw new Error("Link não encontrado.");
    if (link.status !== "pending") throw new Error(`Link está ${link.status}.`);
    if (link.mp_preference_id) throw new Error("Preferência já criada — cancele e refaça o link.");
    const { error: upErr } = await supabase
      .from("payment_links")
      .update({ splits: data.splits.length ? data.splits : null } as any)
      .eq("id", data.linkId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

const attachPixSchema = z.object({
  pixId: z.string().uuid(),
  splits: attachSchema.shape.splits,
});
export const attachSplitsToPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof attachPixSchema>) => attachPixSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: pix, error } = await supabase
      .from("pix_charges")
      .select("id, status, mp_payment_id")
      .eq("id", data.pixId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!pix) throw new Error("Cobrança não encontrada.");
    if (pix.status !== "pending") throw new Error(`Cobrança está ${pix.status}.`);
    if (pix.mp_payment_id) throw new Error("QR já emitido — cancele e refaça a cobrança.");
    const { error: upErr } = await supabase
      .from("pix_charges")
      .update({ splits: data.splits.length ? data.splits : null } as any)
      .eq("id", data.pixId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/* ---------- Relatório de repasses ---------- */
const listSchema = z.object({
  storeId: z.string().uuid().nullable().optional(),
  status: z.enum(["all", "pending", "applied", "error", "manual"]).default("all"),
  recipientId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
export const listSplitEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<z.infer<typeof listSchema>>) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    let q = supabase.from("payment_split_entries")
      .select("id, source_type, source_id, store_id, recipient_customer_id, recipient_name, provider, provider_ref, amount, percentage, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.storeId) q = q.eq("store_id", data.storeId);
    if (data.recipientId) q = q.eq("recipient_customer_id", data.recipientId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const total = (rows ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    return { rows: rows ?? [], total };
  });

const markSchema = z.object({
  entryId: z.string().uuid(),
  status: z.enum(["applied", "manual", "error", "pending"]),
  note: z.string().max(200).optional(),
});
export const markSplitEntryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof markSchema>) => markSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase.from("payment_split_entries")
      .update({ status: data.status, error: data.note ?? null } as any)
      .eq("id", data.entryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
