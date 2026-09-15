// Helper de log de webhooks — grava em public.webhook_events e
// executa applyWebhookUpdate. Usado por todos os webhook routes.
import type { WebhookParsed } from "./types";
import { applyWebhookUpdate } from "./webhook-apply.server";

const HEADER_ALLOWLIST = new Set([
  "user-agent",
  "content-type",
  "x-signature",
  "x-request-id",
  "x-hub-signature",
  "x-authenticity-token",
  "x-authentication",
  "asaas-access-token", // valor será mascarado
]);

function snapshotHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (!HEADER_ALLOWLIST.has(k.toLowerCase())) continue;
    // Mascara qualquer header sensível (token/secret) — mantém tamanho para debug.
    if (/token|signature|secret|authorization/i.test(k)) {
      out[k] = v ? `***${v.slice(-4)}` : "***";
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface LogInput {
  provider: string;
  request: Request;
  rawBody: string;
  parsed: WebhookParsed | null;
  storeIdHint?: string | null;
  parseError?: string | null;
}

/** Registra o evento e, se houver parsed, aplica o update. Retorna o id do evento. */
export async function logAndApplyWebhook(input: LogInput): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const now = new Date().toISOString();

  const base = {
    provider: input.provider,
    store_id: input.storeIdHint ?? null,
    provider_payment_id: input.parsed?.providerId ?? null,
    external_ref: input.parsed?.externalRef ?? null,
    parsed_status: input.parsed?.status ?? null,
    amount: input.parsed?.amount ?? null,
    method: input.parsed?.method ?? null,
    raw_headers: snapshotHeaders(input.request),
    raw_body: input.rawBody?.slice(0, 20000) ?? null,
    parsed: input.parsed ?? null,
    apply_status: input.parsed ? "pending" : (input.parseError ? "error" : "ignored"),
    apply_error: input.parseError ?? null,
    received_at: now,
  };

  const { data: ins, error } = await admin
    .from("webhook_events")
    .insert(base)
    .select("id")
    .single();
  if (error) {
    console.error("[webhook-log] insert falhou:", error.message);
    return null;
  }
  const eventId = ins.id as string;

  if (input.parsed) {
    try {
      await applyWebhookUpdate(input.parsed);
      await admin.from("webhook_events").update({
        apply_status: "applied",
        applied_at: new Date().toISOString(),
      }).eq("id", eventId);
    } catch (e) {
      await admin.from("webhook_events").update({
        apply_status: "error",
        apply_error: (e as Error).message,
      }).eq("id", eventId);
      console.error("[webhook-log] apply falhou:", (e as Error).message);
    }
  }
  return eventId;
}
