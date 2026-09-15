import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { fetchCatalog } from "@/lib/pdv-catalog";
import * as React from "react";
import { usePdv, selectSessionSummary, brl, paymentLabels, type PaymentMethod } from "@/lib/pdv-store";
import { usePdvAuth } from "@/lib/pdv-auth";
import { useQuery } from "@tanstack/react-query";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  fetchSalesRange,
  summarize,
  rangeFromPreset,
  fetchLowStock,
  fetchExpiringAlerts,
  type ReportSummary,
  type LowStockItem,
} from "@/lib/pdv-reports";
import type { ExpiringLot } from "@/lib/pdv-catalog";
import { AlertTriangle, CalendarClock, ShoppingCart, TrendingUp, ArrowRight, Search, Package, ArrowUpCircle, Sparkles, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pdv/")({
  component: PdvIndex,
});

function PdvIndex() {
  const { state } = usePdv();
  const { user } = usePdvAuth();
  const { currentStoreId, viewingAll, currentStore } = useCurrentStore();
  const products = useQuery({ queryKey: ["catalog"], queryFn: fetchCatalog });
  const catalogData = Array.isArray(products.data) ? products.data : [];

  if (state.session && state.session.closedAt) {
    return <Navigate to="/pdv/fechamento" replace />;
  }

  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  const sessionSummary = selectSessionSummary(state);

  const [today, setToday] = React.useState<ReportSummary | null>(null);
  const [remote, setRemote] = React.useState<ReportSummary | null>(null);
  const [lowStock, setLowStock] = React.useState<LowStockItem[]>([]);
  const [expiring, setExpiring] = React.useState<ExpiringLot[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!isPrivileged) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const scope = viewingAll ? null : currentStoreId;
        const week = rangeFromPreset("7d");
        const startToday = new Date();
        startToday.setHours(0, 0, 0, 0);
        const endToday = new Date();
        const [salesWeek, salesToday, ls, exp] = await Promise.all([
          fetchSalesRange(week.start, week.end, scope),
          fetchSalesRange(startToday, endToday, scope),
          fetchLowStock(5),
          fetchExpiringAlerts(60),
        ]);
        if (!alive) return;
        setRemote(summarize(salesWeek));
        setToday(summarize(salesToday));
        setLowStock(ls);
        setExpiring(exp);
      } catch (e) {
        console.error("[dashboard]", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isPrivileged, currentStoreId, viewingAll]);

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <input 
            type="text" 
            placeholder="Buscar produtos, pedidos..." 
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D63351]/20 focus:border-[#D63351] transition-all"
          />
        </div>

        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Olá, {user?.displayName?.split(" ")[0] ?? "Katarine"} 👋
            </h1>
            <p className="text-sm text-muted-foreground">
              {viewingAll ? "Todas as lojas" : currentStore?.name ?? user?.storeName ?? "KS MultiMake"}
            </p>
          </div>
          <div className="hidden sm:flex gap-2">
            <Button asChild size="sm" variant="outline" className="rounded-lg">
              <Link to="/pdv/venda">
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                Venda Rápida
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Ações Rápidas - Estilo WASeller */}
      <section className="grid grid-cols-4 gap-2 py-2">
        <ActionButton to="/pdv/catalogo" icon={<Package className="h-6 w-6" />} label="Produto" color="bg-blue-500" />
        <ActionButton to="/pdv/produtos-lote" icon={<ArrowUpCircle className="h-6 w-6" />} label="Em Lote" color="bg-orange-500" />
        <ActionButton to="/pdv/social-manager" icon={<Sparkles className="h-6 w-6" />} label="Criar Post" color="bg-[#D63351]" />
        <ActionButton to="/pdv/config" icon={<User className="h-6 w-6" />} label="Perfil" color="bg-purple-600" />
      </section>

      {/* Destaques do Catálogo - Scroll Horizontal */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Produtos em destaque</h2>
          <Link to="/pdv/catalogo" className="text-xs font-semibold text-[#D63351]">Ver todos</Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
          {state.catalog.slice(0, 6).map((p) => {
            const catalogItem = catalogData.find(cp => cp.sku === p.sku);
            const imageUrl = catalogItem?.image_signed_url;
            return (
              <div key={p.sku} className="flex-shrink-0 w-40 bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                  {imageUrl ? (
                    <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-10 w-10 text-slate-300" />
                  )}
                  <button className="absolute bottom-2 right-2 w-8 h-8 bg-[#D63351] rounded-full flex items-center justify-center text-white shadow-md active:scale-90">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="text-[11px] text-muted-foreground truncate">{p.sku}</p>
                  <h3 className="text-xs font-bold text-slate-800 line-clamp-2 min-h-[2rem]">{p.name}</h3>
                  <p className="mt-1 text-sm font-bold text-[#D63351]">{brl(p.unit)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Resumo estilo WASeller */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">
          Resumo do dia
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Vendas Hoje"
            value={String(today?.count ?? sessionSummary.count)}
            hint={state.session ? "Caixa aberto" : "Sessão offline"}
            tone="success"
          />
          <KpiCard
            label="Receita Bruta"
            value={brl(today?.revenue ?? sessionSummary.revenue)}
            hint="Vendas confirmadas"
          />
        </div>
      </section>

      {/* Alertas Críticos */}
      {isPrivileged && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">
            Atenção necessária
          </h2>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Vendas hoje"
                value={String(today?.count ?? 0)}
                hint={`${today?.uniqueCustomers ?? 0} clientes únicos`}
                tone={(today?.count ?? 0) > 0 ? "success" : "default"}
              />
              <KpiCard label="Faturamento hoje" value={brl(today?.revenue ?? 0)} />
              <KpiCard label="Ticket médio" value={brl(today?.ticket ?? 0)} />
              <KpiCard
                label="Cashback usado hoje"
                value={brl(today?.cashbackUsed ?? 0)}
                hint={`distribuído: ${brl(today?.cashbackEarned ?? 0)}`}
              />
            </div>
          )}
        </section>
      )}


      {/* Alertas */}
      {isPrivileged && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Estoque baixo</h3>
            </div>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tudo em dia.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {lowStock.slice(0, 6).map((p) => (
                  <li key={p.productId} className="flex items-center justify-between gap-3">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 font-mono text-xs text-amber-700 dark:text-amber-400">
                      {p.qty} un
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="mb-3 flex items-center gap-2 text-destructive">
              <CalendarClock className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Vencimento próximo (60d)</h3>
            </div>
            {expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lote crítico.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {expiring.slice(0, 6).map((l) => (
                  <li key={l.lot_id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      {l.product_name}{" "}
                      <span className="text-xs text-muted-foreground">· {l.lot_code}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs">{l.validity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ActionButton({ to, icon, label, color }: { to: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-2 group">
      <div className={`${color} w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 group-hover:scale-105`}>
        {icon}
      </div>
      <span className="text-[11px] font-medium text-slate-700 text-center leading-tight">{label}</span>
    </Link>
  );
}
