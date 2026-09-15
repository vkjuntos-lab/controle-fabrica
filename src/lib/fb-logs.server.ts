// Server-only: logging helper para webhook e ações do Facebook.
export type FbLogInput = {
  store_id?: string | null;
  direction?: "inbound" | "outbound";
  status?: "ok" | "error" | "invalid_signature" | "stale" | "bad_json" | "ignored";
  http_status?: number | null;
  signature_valid?: boolean | null;
  event_type?: string | null;
  sender_id?: string | null;
  recipient_id?: string | null;
  error?: string | null;
  request?: unknown;
  response?: unknown;
};

function redact(obj: unknown): unknown {
  if (!obj) return obj;
  try {
    const json = typeof obj === "string" ? obj : JSON.stringify(obj);
    const trimmed = json.length > 8000 ? json.slice(0, 8000) + "…[truncated]" : json;
    return JSON.parse(trimmed);
  } catch {
    return { raw: String(obj).slice(0, 4000) };
  }
}

export async function logFbWebhook(input: FbLogInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("fb_webhook_logs").insert({
      store_id: input.store_id ?? null,
      direction: input.direction ?? "inbound",
      status: input.status ?? "ok",
      http_status: input.http_status ?? null,
      signature_valid: input.signature_valid ?? null,
      event_type: input.event_type ?? null,
      sender_id: input.sender_id ?? null,
      recipient_id: input.recipient_id ?? null,
      error: input.error ?? null,
      request: input.request ? redact(input.request) : null,
      response: input.response ? redact(input.response) : null,
    } as any);
  } catch (e) {
    console.error("[fb-logs] insert failed:", (e as Error).message);
  }
}
