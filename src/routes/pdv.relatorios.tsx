import { createFileRoute, Navigate } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePdvAuth } from "@/lib/pdv-auth";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { brl, paymentLabels, type PaymentMethod } from "@/lib/pdv-store";
import {
  fetchSalesRange,
  fetchLowStock,
  fetchExpiringAlerts,
  summarize,
  rangeFromPreset,
  type ReportSummary,
  type LowStockItem,
  type RangePreset,
} from "@/lib/pdv-reports";
import type { ExpiringLot } from "@/lib/pdv-catalog";
import { getBellaCampaignRoi } from "@/lib/pdv-reports-roi.functions";

export const Route = createFileRoute("/pdv/relatorios")({
  component: RelatoriosRoute,
});

function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (!rows.length) return "";
  const keys = headers ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(";"), ...rows.map((r) => keys.map((k) => esc(r[k])).join(";"))].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosRoute() {
  const { user, loading } = usePdvAuth();
  if (loading) return null;
  if (!user || (user.role !== "admin" && user.role !== "manager"))
    return <Navigate to="/pdv/venda" replace />;
  return <Relatorios />;
}

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "24h", label: "Últimas 24h" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
];

const METHOD_ORDER: PaymentMethod[] = ["cash", "pix", "debit", "credit", "cashback"];

function presetDays(p: RangePreset): number {
  return p === "24h" ? 1 : p === "7d" ? 7 : p === "30d" ? 30 : 90;
}

function Relatorios() {
  const { currentStoreId, viewingAll, currentStore } = useCurrentStore();
  const [preset, setPreset] = React.useState<RangePreset>("7d");
  const [summary, setSummary] = React.useState<ReportSummary | null>(null);
  const [lowStock, setLowStock] = React.useState<LowStockItem[]>([]);
  const [expiring, setExpiring] = React.useState<ExpiringLot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { start, end } = rangeFromPreset(preset);
    // viewingAll (admin) => sem filtro; caso contrário filtra pela loja atual
    const scope = viewingAll ? null : currentStoreId;
    Promise.all([
      fetchSalesRange(start, end, scope),
      fetchLowStock(5),
      fetchExpiringAlerts(60),
    ])
      .then(([sales, low, exp]) => {
        if (cancelled) return;
        setSummary(summarize(sales));
        setLowStock(low);
        setExpiring(exp);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError("Erro ao carregar relatórios.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [preset, currentStoreId, viewingAll]);

  const roiFn = useServerFn(getBellaCampaignRoi);
  const roiQuery = useQuery({
    queryKey: ["bella-roi", preset, viewingAll ? "all" : currentStoreId],
    queryFn: () =>
      roiFn({
        data: {
          store_id: viewingAll ? null : currentStoreId,
          days: presetDays(preset),
        },
      }),
  });

  const dayMax = summary ? Math.max(1, ...summary.byDay.map((d) => d.revenue)) : 1;
  const methodTotal =
    summary
      ? METHOD_ORDER.reduce((s, m) => s + summary.byMethod[m], 0) || 1
      : 1;

  function exportSalesCsv() {
    if (!summary) return;
    const rows = summary.byDay.map((d) => ({
      data: d.date,
      vendas: d.count,
      faturamento: d.revenue.toFixed(2),
    }));
    downloadCsv(`vendas-${preset}.csv`, toCsv(rows));
  }

  function exportProductsCsv() {
    if (!summary) return;
    const rows = summary.topProducts.map((t) => ({
      sku: t.sku,
      produto: t.name,
      qtd: t.qty,
      faturamento: t.revenue.toFixed(2),
    }));
    downloadCsv(`produtos-${preset}.csv`, toCsv(rows));
  }

  function exportRoiCsv() {
    const rows = roiQuery.data?.rows ?? [];
    if (!rows.length) return;
    downloadCsv(`campanhas-bella-${preset}.csv`, toCsv(rows));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Relatórios</h2>
          <p className="text-xs text-muted-foreground">
            Vendas, ticket médio, cashback e alertas de estoque
            {" · "}
            <span className="font-medium text-foreground">
              {viewingAll ? "Todas as lojas" : currentStore?.name ?? "—"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1 text-xs">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  preset === p.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 text-xs">
            <button
              onClick={exportSalesCsv}
              disabled={!summary}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              CSV vendas
            </button>
            <button
              onClick={exportProductsCsv}
              disabled={!summary}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              CSV produtos
            </button>
          </div>
        </div>
      </div>


      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading || !summary ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Vendas" value={String(summary.count)} />
            <Kpi label="Faturamento" value={brl(summary.revenue)} tone="accent" />
            <Kpi label="Ticket médio" value={brl(summary.ticket)} />
            <Kpi label="Clientes únicos" value={String(summary.uniqueCustomers)} />
            <Kpi label="Cashback usado" value={brl(summary.cashbackUsed)} />
            <Kpi label="Cashback gerado" value={brl(summary.cashbackEarned)} />
            <Kpi label="Estoque baixo" value={String(lowStock.length)} tone={lowStock.length ? "warn" : "ok"} />
            <Kpi label="Lotes p/ vencer" value={String(expiring.length)} tone={expiring.length ? "warn" : "ok"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Vendas por dia */}
            <Card title="Faturamento por dia">
              {summary.byDay.length === 0 ? (
                <Empty>Sem vendas no período.</Empty>
              ) : (
                <ul className="space-y-2">
                  {summary.byDay.map((d) => (
                    <li key={d.date} className="text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-muted-foreground">
                          {new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            weekday: "short",
                          })}
                        </span>
                        <span className="tabular-nums">
                          {brl(d.revenue)} · {d.count} {d.count === 1 ? "venda" : "vendas"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(d.revenue / dayMax) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Por forma de pagamento */}
            <Card title="Formas de pagamento">
              <ul className="space-y-2">
                {METHOD_ORDER.map((m) => {
                  const v = summary.byMethod[m];
                  return (
                    <li key={m} className="text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-muted-foreground">{paymentLabels[m]}</span>
                        <span className="tabular-nums">
                          {brl(v)}{" "}
                          <span className="text-muted-foreground">
                            ({Math.round((v / methodTotal) * 100)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/80"
                          style={{ width: `${(v / methodTotal) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* Por operador */}
            <Card title="Vendas por operador">
              {summary.byOperator.length === 0 ? (
                <Empty>Sem vendas no período.</Empty>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="grid grid-cols-[1fr_80px_120px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span>Operador</span>
                    <span className="text-right">Vendas</span>
                    <span className="text-right">Faturamento</span>
                  </div>
                  {summary.byOperator.map((o) => (
                    <div
                      key={o.operator}
                      className="grid grid-cols-[1fr_80px_120px] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0"
                    >
                      <span className="truncate font-medium">{o.operator}</span>
                      <span className="text-right tabular-nums">{o.count}</span>
                      <span className="text-right tabular-nums">{brl(o.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Top produtos */}
            <Card title="Produtos mais vendidos">
              {summary.topProducts.length === 0 ? (
                <Empty>Sem produtos vendidos no período.</Empty>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="grid grid-cols-[1fr_60px_120px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span>Produto</span>
                    <span className="text-right">Qtd</span>
                    <span className="text-right">Faturamento</span>
                  </div>
                  {summary.topProducts.map((t) => (
                    <div
                      key={t.sku}
                      className="grid grid-cols-[1fr_60px_120px] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="text-[11px] text-muted-foreground">SKU {t.sku}</div>
                      </div>
                      <span className="text-right tabular-nums">{t.qty}</span>
                      <span className="text-right tabular-nums">{brl(t.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ROI de campanhas Bella */}
          <Card title="ROI de campanhas Bella IA">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Envios, conversões atribuídas via cupom e receita gerada no período.
              </p>
              <button
                onClick={exportRoiCsv}
                disabled={!(roiQuery.data?.rows?.length)}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
              >
                Exportar CSV
              </button>
            </div>
            {roiQuery.isLoading ? (
              <Empty>Carregando…</Empty>
            ) : (roiQuery.data?.rows?.length ?? 0) === 0 ? (
              <Empty>Sem envios de campanha no período.</Empty>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <div className="grid grid-cols-[1fr_70px_70px_70px_70px_110px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>Campanha</span>
                  <span className="text-right">Envios</span>
                  <span className="text-right">Entregues</span>
                  <span className="text-right">Conv.</span>
                  <span className="text-right">Conv. %</span>
                  <span className="text-right">Receita</span>
                </div>
                {(roiQuery.data?.rows ?? []).map((r) => (
                  <div
                    key={r.campaign_type}
                    className="grid grid-cols-[1fr_70px_70px_70px_70px_110px] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0"
                  >
                    <span className="truncate font-medium">{r.campaign_type}</span>
                    <span className="text-right tabular-nums">{r.sends}</span>
                    <span className="text-right tabular-nums">{r.delivered}</span>
                    <span className="text-right tabular-nums">{r.conversions}</span>
                    <span className="text-right tabular-nums">{r.conv_rate}%</span>
                    <span className="text-right tabular-nums">{brl(r.revenue)}</span>
                  </div>
                ))}
                {roiQuery.data?.totals && (
                  <div className="grid grid-cols-[1fr_70px_70px_70px_70px_110px] items-center gap-2 bg-muted/30 px-3 py-2 text-xs font-semibold">
                    <span>Total</span>
                    <span className="text-right tabular-nums">{roiQuery.data.totals.sends}</span>
                    <span className="text-right tabular-nums">{roiQuery.data.totals.delivered}</span>
                    <span className="text-right tabular-nums">{roiQuery.data.totals.conversions}</span>
                    <span className="text-right tabular-nums">
                      {roiQuery.data.totals.delivered
                        ? Math.round(
                            (roiQuery.data.totals.conversions / roiQuery.data.totals.delivered) * 100,
                          )
                        : 0}
                      %
                    </span>
                    <span className="text-right tabular-nums">{brl(roiQuery.data.totals.revenue)}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Alertas */}
          <div className="grid gap-6 lg:grid-cols-2">

            <Card title={`Estoque baixo (≤ 5 un)`}>
              {lowStock.length === 0 ? (
                <Empty>Nenhum produto com estoque crítico.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {lowStock.map((r) => (
                    <li
                      key={r.productId}
                      className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">SKU {r.sku}</div>
                      </div>
                      <span
                        className={`tabular-nums font-semibold ${
                          r.qty === 0
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {r.qty} un.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Lotes para vencer (≤ 60 dias)">
              {expiring.length === 0 ? (
                <Empty>Sem lotes próximos do vencimento.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {expiring.map((l) => {
                    const expired = l.days_left <= 0;
                    return (
                      <li
                        key={l.lot_id}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                          expired
                            ? "border-destructive/40 bg-destructive/5"
                            : l.days_left <= 30
                              ? "border-amber-500/40 bg-amber-500/5"
                              : "border-border bg-muted/20"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{l.product_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Lote {l.lot_code} · SKU {l.sku} · {l.qty} un.
                          </div>
                        </div>
                        <span
                          className={`tabular-nums text-right ${
                            expired
                              ? "text-destructive font-semibold"
                              : l.days_left <= 30
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {expired ? "Vencido" : `${l.days_left}d`}
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(l.validity).toLocaleDateString("pt-BR", {
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </div>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "ok" | "warn";
}) {
  const color =
    tone === "accent"
      ? "text-primary"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
