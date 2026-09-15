// Envio de Web Push via web-push (VAPID). Server-only.
import webpush from "web-push";

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
};

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contato@estrategia.app";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys ausentes. Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/** Envia um push para todas as inscrições ativas de um usuário. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  ensureConfigured();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await (supabaseAdmin as any)
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!subs || subs.length === 0) return 0;

  let sent = 0;
  for (const s of subs as any[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent += 1;
      await (supabaseAdmin as any)
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", s.id);
    } catch (err: any) {
      const status = err?.statusCode as number | undefined;
      console.error("[push] falha:", status, err?.body ?? err?.message);
      // 404/410 = inscrição expirada — remove
      if (status === 404 || status === 410) {
        await (supabaseAdmin as any).from("push_subscriptions").delete().eq("id", s.id);
      } else {
        await (supabaseAdmin as any)
          .from("push_subscriptions")
          .update({ failure_count: (Number(s.failure_count) || 0) + 1 })
          .eq("id", s.id);
      }
    }
  }
  return sent;
}

/** Envia para todos os usuários com role específica em uma loja. */
export async function sendPushToStoreRole(
  storeId: string,
  role: "admin" | "manager" | "cashier" | "stockist",
  payload: PushPayload,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("user_id")
    .eq("store_id", storeId)
    .eq("role", role)
    .eq("active", true);
  const users = Array.from(new Set(((data ?? []) as any[]).map((r) => r.user_id)));
  let total = 0;
  for (const uid of users) total += await sendPushToUser(uid, payload);
  return total;
}
