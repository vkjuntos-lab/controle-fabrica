// Onda Q — Push notifications & realtime sync.
// Camada client-only usando Notification API (permission opt-in) + Supabase Realtime
// (broadcast channel por loja) para propagar eventos entre caixas.
import { supabase } from "@/integrations/supabase/client";

/* ---------- Notification API ---------- */

export type NotifPermission = "default" | "granted" | "denied" | "unsupported";

export function currentPermission(): NotifPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifPermission;
}

export async function requestPushPermission(): Promise<NotifPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission as NotifPermission;
  }
  const p = await Notification.requestPermission();
  return p as NotifPermission;
}

export function localNotify(title: string, opts?: NotificationOptions): boolean {
  if (currentPermission() !== "granted") return false;
  try {
    const n = new Notification(title, { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", ...opts });
    n.onclick = () => { window.focus(); n.close(); };
    return true;
  } catch { return false; }
}

/* ---------- Realtime sync (multi-caixa) ----------
 * Cada loja tem um broadcast channel `store:<storeId>`.
 * Emissores: PDV (venda confirmada, caixa aberto/fechado, catálogo alterado).
 * Consumidores: outras abas do mesmo caixa OU outros caixas da mesma loja.
 */

type SyncEvent =
  | { type: "sale_finalized"; sale_id: string; total: number; op: string }
  | { type: "session_opened"; session_id: string; op: string }
  | { type: "session_closed"; session_id: string }
  | { type: "catalog_updated" }
  | { type: "customer_updated"; customer_id: string }
  | { type: "notification"; title: string; body?: string };

export type SyncHandler = (evt: SyncEvent) => void;

const channels = new Map<string, ReturnType<typeof supabase.channel>>();

function chanKey(storeId: string) { return `store:${storeId}`; }

export function subscribeStoreSync(storeId: string, handler: SyncHandler): () => void {
  if (!storeId) return () => {};
  const key = chanKey(storeId);
  let ch = channels.get(key);
  if (!ch) {
    ch = supabase.channel(key, { config: { broadcast: { self: false } } });
    channels.set(key, ch);
    ch.subscribe();
  }
  const wrapped = (payload: any) => {
    try { handler(payload.payload as SyncEvent); } catch { /* ignore */ }
  };
  ch.on("broadcast", { event: "sync" }, wrapped);
  return () => {
    try { ch?.unsubscribe(); } catch {}
    channels.delete(key);
  };
}

export async function publishStoreSync(storeId: string, event: SyncEvent): Promise<void> {
  if (!storeId) return;
  const key = chanKey(storeId);
  let ch = channels.get(key);
  if (!ch) {
    ch = supabase.channel(key);
    channels.set(key, ch);
    await new Promise<void>((resolve) => { ch!.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); }); });
  }
  try { await ch.send({ type: "broadcast", event: "sync", payload: event }); } catch { /* offline: ok */ }
}
