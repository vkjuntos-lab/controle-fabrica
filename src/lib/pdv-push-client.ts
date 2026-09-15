// Hook para gerenciar inscrição Web Push no navegador do usuário.
import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
  sendTestPush,
} from "./pdv-push.functions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i += 1) bin += String.fromCharCode(bytes[i]);
  return typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
}

export type PushState = "unsupported" | "denied" | "granted" | "default" | "loading";

export function usePushNotifications(storeId?: string | null) {
  const [state, setState] = React.useState<PushState>("loading");
  const [subscribed, setSubscribed] = React.useState<boolean>(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const getKey = useServerFn(getVapidPublicKey);
  const save = useServerFn(savePushSubscription);
  const del = useServerFn(deletePushSubscription);
  const test = useServerFn(sendTestPush);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  React.useEffect(() => {
    if (!supported) { setState("unsupported"); return; }
    setState(Notification.permission as PushState);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
        const sub = await reg?.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch { /* ignore */ }
    })();
  }, [supported]);

  const subscribe = React.useCallback(async () => {
    if (!supported) return;
    setBusy(true); setError(null);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PushState);
      if (permission !== "granted") { setBusy(false); return; }

      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const { publicKey } = await getKey();
      if (!publicKey) throw new Error("VAPID_PUBLIC_KEY não configurada no servidor.");

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        });
      }

      const json = sub.toJSON() as any;
      await save({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? arrayBufToBase64(sub.getKey("p256dh")),
          auth: json.keys?.auth ?? arrayBufToBase64(sub.getKey("auth")),
          user_agent: navigator.userAgent,
          store_id: storeId ?? null,
        },
      });
      setSubscribed(true);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao ativar notificações");
    } finally {
      setBusy(false);
    }
  }, [supported, getKey, save, storeId]);

  const unsubscribe = React.useCallback(async () => {
    if (!supported) return;
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await del({ data: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao desativar");
    } finally {
      setBusy(false);
    }
  }, [supported, del]);

  const sendTest = React.useCallback(async () => {
    setBusy(true); setError(null);
    try {
      await test();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao enviar teste");
    } finally { setBusy(false); }
  }, [test]);

  return { supported, state, subscribed, busy, error, subscribe, unsubscribe, sendTest };
}
