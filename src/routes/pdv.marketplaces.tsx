import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listMarketplaces, pingMarketplace } from "@/lib/pdv-marketplaces.functions";
import { Loader2, CheckCircle2, XCircle, Plug, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/pdv/marketplaces")({
  component: MarketplacesPage,
});

function MarketplacesPage() {
  const listFn = useServerFn(listMarketplaces);
  const pingFn = useServerFn(pingMarketplace);
  const { data: providers, isLoading } = useQuery({
    queryKey: ["marketplaces"],
    queryFn: () => listFn({ data: {} as any }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Marketplaces</h2>
          <p className="text-xs text-muted-foreground">
            Conecte-se a marketplaces para sincronizar catálogo, estoque e pedidos.
            Drivers são plugáveis por provedor.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando provedores…
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(providers ?? []).map((p: any) => (
            <ProviderCard key={p.provider} provider={p.provider} label={p.label} ping={pingFn} />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <b>Status:</b> drivers registrados como stubs. Conexão real (OAuth, tokens,
        webhooks de pedidos) será plugada por provedor em ondas seguintes conforme
        prioridade comercial.
      </div>
    </div>
  );
}

function ProviderCard({ provider, label, ping }: { provider: string; label: string; ping: any }) {
  const mut = useMutation({ mutationFn: () => ping({ data: { provider } }) });
  const isNative = provider === "tiktokshop" || provider === "mercadolivre";
  const configPath = provider === "tiktokshop" ? "/pdv/tiktok-shop" : provider === "mercadolivre" ? "/pdv/mercado-livre" : null;


  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{label}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${isNative ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {isNative ? "Nativo" : "stub"}
        </span>

      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Sync de produtos, estoque e pedidos. Requer OAuth do provedor.
      </p>
      
      <div className="mt-4 space-y-2">
        {isNative && configPath && (
          <Link
            to={configPath as any}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Configurar {label}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}


        <div className="flex items-center gap-2">
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="rounded-md border border-border px-3 py-1.5 text-[10px] hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {mut.isPending ? "Testando…" : "Testar conexão"}
          </button>
          {mut.data ? (() => {
            const r = mut.data as { ok: boolean; message?: string };
            return (
              <span className={`inline-flex items-center gap-1 text-[10px] ${r.ok ? "text-emerald-600" : "text-amber-600"}`}>
                {r.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {r.message ?? (r.ok ? "OK" : "Falhou")}
              </span>
            );
          })() : null}
        </div>
      </div>
    </div>
  );
}
