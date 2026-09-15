import * as React from "react";
import { countPending, syncPending, listPendingSales } from "@/lib/pdv-offline-queue";

export function OfflineBanner() {
  const [online, setOnline] = React.useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try { setPending(await countPending()); } catch {}
  }, []);

  React.useEffect(() => {
    refresh();
    const on = () => { setOnline(true); refresh(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(refresh, 15000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [refresh]);

  const sync = async () => {
    setSyncing(true);
    try {
      // Import lazily to evitar acoplar router aqui — sync real deve ser plugado por página.
      const items = await listPendingSales();
      // Emite evento global: páginas que sabem submeter (ex.: pdv.venda.tsx) escutam e chamam server fn.
      window.dispatchEvent(new CustomEvent("pdv:sync-pending", { detail: { count: items.length } }));
    } finally { setSyncing(false); setTimeout(refresh, 500); }
  };

  if (online && pending === 0) return null;
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${online ? "bg-amber-500/20 text-amber-900" : "bg-destructive/20 text-destructive"}`}>
      <div>
        {online
          ? <>🟠 <b>{pending}</b> venda(s) pendente(s) de sincronização.</>
          : <>🔴 Sem conexão — vendas serão enfileiradas localmente.</>}
      </div>
      {pending > 0 && online && (
        <button onClick={sync} disabled={syncing}
          className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-[11px] font-medium">
          {syncing ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      )}
    </div>
  );
}

export { syncPending };
