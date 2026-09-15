// PWA registration wrapper — guarded per Lovable preview safety rules.
// Only registers /sw.js in real production origins.
const APP_SW_URL = "/sw.js";

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.top !== window.self) return true;
  } catch { return true; }
  const url = new URL(window.location.href);
  if (url.searchParams.get("sw") === "off") return true;
  const h = url.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterApp() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter(r => (r.active?.scriptURL ?? "").endsWith(APP_SW_URL)).map(r => r.unregister()));
}

export async function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  if (isRefusedContext()) { await unregisterApp(); return; }
  try {
    await navigator.serviceWorker.register(APP_SW_URL, { scope: "/" });
  } catch (e) { console.warn("[pwa] register failed", e); }
}
