// Listagem e reprocessamento de eventos de webhook (Onda F/G/H — observabilidade).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertManager(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  if (!isAdmin && !isManager) throw new Error("Apenas gerente ou administrador podem ver logs de webhook.");
}

export type WebhookEventRow = {
  id: string;
  provider: string;
  store_id: string | null;
  provider_payment_id: string | null;
  external_ref: string | null;
  parsed_status: string | null;
  amount: number | null;
  method: string | null;
  raw_headers: Record<string, string> | null;
  raw_body: string | null;
  parsed: any;
  apply_status: "pending" | "applied" | "ignored" | "error";
  apply_error: string | null;
  applied_at: string | null;
  received_at: string;
};

const listSchema = z.object({
  provider: z.enum(["mercadopago", "asaas", "pagbank", "pagarme"]).nullable().optional(),
  status: z.enum(["pending", "applied", "ignored", "error"]).nullable().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof listSchema>) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    await assertManager(supabase, (context as any).userId);
    let q = supabase
      .from("webhook_events")
      .select("id, provider, store_id, provider_payment_id, external_ref, parsed_status, amount, method, raw_headers, raw_body, parsed, apply_status, apply_error, applied_at, received_at")
      .order("received_at", { ascending: false })
      .limit(data.limit);
    if (data.provider) q = q.eq("provider", data.provider);
    if (data.status) q = q.eq("apply_status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as WebhookEventRow[];
  });

export const retryWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    await assertManager(supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: row, error } = await admin
      .from("webhook_events").select("*").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Error("Evento não encontrado.");
    if (!row.parsed) throw new Error("Evento sem payload parseado — não pode ser reprocessado.");

    const { applyWebhookUpdate } = await import("@/lib/gateways/webhook-apply.server");
    try {
      await applyWebhookUpdate(row.parsed);
      await admin.from("webhook_events").update({
        apply_status: "applied",
        applied_at: new Date().toISOString(),
        apply_error: null,
      }).eq("id", data.id);
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from("webhook_events").update({
        apply_status: "error",
        apply_error: msg,
      }).eq("id", data.id);
      return { ok: false, message: msg };
    }
  });
