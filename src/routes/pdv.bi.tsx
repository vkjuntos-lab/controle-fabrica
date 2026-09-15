import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { biOverview, biTopProducts, biTopCustomers, biCohort } from "@/lib/pdv-bi.functions";
import { useCurrentStore } from "@/lib/pdv-current-store";

export const Route = createFileRoute("/pdv/bi")({
  component: BiPage,
});

type Tab = "overview" | "products" | "customers";

function toIso(d: Date) { return d.toISOString(); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; }
function brl(n: number) { return `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#f59e0b", "#0891b2", "#db2777"];

function BiPage() {
  const { currentStoreId, viewingAll, currentStore } = useCurrentStore();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [days, setDays] = React.useState(30);
  const scope = viewingAll ? null : currentStoreId;
  const range = React.useMemo(() => ({
    from: toIso(daysAgo(days)),
    to: toIso(new Date()),
    storeId: scope,
  }), [days, scope]);

  const overviewFn = useServerFn(biOverview);
  const productsFn = useServerFn(biTopProducts);
  const customersFn = useServerFn(biTopCustomers);
  const cohortFn = useServerFn(biCohort);

  const { data: ov } = useQuery({ queryKey: ["bi-ov", range], queryFn: () => overviewFn({ data: range }), staleTime: 60_000 });
  const { data: prods } = useQuery({ queryKey: ["bi-prods", range], queryFn: () => productsFn({ data: range }), staleTime: 60_000, enabled: tab === "products" });
  const { data: custs } = useQuery({ queryKey: ["bi-custs", range], queryFn: () => customersFn({ data: range }), staleTime: 60_000, enabled: tab === "customers" });
  const { data: cohort } = useQuery({ queryKey: ["bi-cohort", range], queryFn: () => cohortFn({ data: range }), staleTime: 60_000, enabled: tab === "customers" });

  const exportOverview = async () => {
    if (!ov) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const kpi = XLSX.utils.aoa_to_sheet([
      ["Indicador", "Valor"],
      ["Faturamento", ov.revenue],
      ["Ticket médio", ov.avgTicket],
      ["Nº vendas", ov.count],
      ["Δ% vs. anterior", `${ov.deltaPct.toFixed(1)}%`],
      ["Clientes únicos", ov.uniqueCustomers],
      ["Novos clientes", ov.newCustomers],
      [],
      ["Insights"],
      ...ov.insights.map(i => [i]),
    ]);
    XLSX.utils.book_append_sheet(wb, kpi, "Resumo");
    const daily = XLSX.utils.json_to_sheet(ov.daily);
    XLSX.utils.book_append_sheet(wb, daily, "Diário");
    const mix = XLSX.utils.json_to_sheet(ov.paymentMix);
    XLSX.utils.book_append_sheet(wb, mix, "Meios de pagto");
    XLSX.writeFile(wb, `bi-visao-${range.from.slice(0,10)}_${range.to.slice(0,10)}.xlsx`);
  };

  const exportProducts = async () => {
    if (!prods) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(prods.rows.map(r => ({
      SKU: r.sku, Produto: r.name, Qtd: r.qty, Receita: r.revenue, "% Acumulado": r.cumPct.toFixed(1), Curva: r.abc,
    })));
    XLSX.utils.book_append_sheet(wb, ws, "Top produtos");
    XLSX.writeFile(wb, `bi-produtos-${range.from.slice(0,10)}.xlsx`);
  };

  const exportCustomers = async () => {
    if (!custs || !cohort) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const top = XLSX.utils.json_to_sheet(custs.rows.map(c => ({
      Cliente: c.name, CPF: c.cpf, Telefone: c.phone, Pedidos: c.orders, Receita: c.revenue, Ticket: c.ticket, Última: c.last.slice(0, 10),
    })));
    XLSX.utils.book_append_sheet(wb, top, "Top clientes");
    const header = ["Cohort", "Tamanho", ...cohort.months];
    const cohortRows = cohort.cohorts.map(c => [c.cohort, c.size, ...c.row.map(x => `${x.pct.toFixed(1)}%`)]);
    const wsC = XLSX.utils.aoa_to_sheet([header, ...cohortRows]);
    XLSX.utils.book_append_sheet(wb, wsC, "Cohort retenção");
    XLSX.writeFile(wb, `bi-clientes-${range.from.slice(0,10)}.xlsx`);
  };

  const exportFn = tab === "overview" ? exportOverview : tab === "products" ? exportProducts : exportCustomers;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">BI & Relatórios Avançados</h2>
          <p className="text-xs text-muted-foreground">
            {viewingAll ? "Todas as lojas" : currentStore?.name ?? "—"} · análises consolidadas de vendas, produtos e clientes.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {[7, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`rounded-md border px-3 py-1.5 text-xs ${days === d ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
              {d}d
            </button>
          ))}
          <button onClick={exportFn}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
            ⬇ Exportar XLSX
          </button>
        </div>
      </header>

      {ov?.insights && ov.insights.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">Insights</div>
          <ul className="space-y-1 text-sm">
            {ov.insights.map((i, k) => <li key={k}>• {i}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-2 border-b border-border">
        {(["overview", "products", "customers"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {t === "overview" ? "Visão geral" : t === "products" ? "Produtos" : "Clientes"}
          </button>
        ))}
      </div>

      {tab === "overview" && ov && (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label="Faturamento" value={brl(ov.revenue)} delta={ov.deltaPct} />
            <Kpi label="Ticket médio" value={brl(ov.avgTicket)} />
            <Kpi label="Vendas" value={ov.count.toString()} />
            <Kpi label="Novos clientes" value={String(ov.newCustomers)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold mb-3">Faturamento diário</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={ov.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => brl(Number(v))} />
                  <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold mb-3">Mix de pagamento</div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={ov.paymentMix} dataKey="amount" nameKey="method" innerRadius={50} outerRadius={90} label>
                    {ov.paymentMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === "products" && prods && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold mb-3">Top 10 produtos (receita)</div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={prods.rows.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" fontSize={11} width={100} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Bar dataKey="revenue" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Receita</th>
                  <th className="px-3 py-2 text-right">% Acum</th>
                  <th className="px-3 py-2 text-center">Curva</th>
                </tr>
              </thead>
              <tbody>
                {prods.rows.slice(0, 50).map(r => (
                  <tr key={r.sku} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                    <td className="px-3 py-2 text-xs">{r.name}</td>
                    <td className="px-3 py-2 text-right text-xs">{r.qty}</td>
                    <td className="px-3 py-2 text-right text-xs">{brl(r.revenue)}</td>
                    <td className="px-3 py-2 text-right text-xs">{r.cumPct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        r.abc === "A" ? "bg-emerald-500/15 text-emerald-700" :
                        r.abc === "B" ? "bg-amber-500/15 text-amber-700" :
                        "bg-muted text-muted-foreground"
                      }`}>{r.abc}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "customers" && (
        <div className="space-y-4">
          {custs && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 text-sm font-semibold border-b border-border">Top 50 clientes por receita (LTV do período)</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">CPF</th>
                    <th className="px-3 py-2 text-right">Pedidos</th>
                    <th className="px-3 py-2 text-right">Ticket</th>
                    <th className="px-3 py-2 text-right">Receita</th>
                    <th className="px-3 py-2 text-left">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {custs.rows.map(c => (
                    <tr key={c.customerId} className="border-t border-border">
                      <td className="px-3 py-2 text-xs">{c.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.cpf}</td>
                      <td className="px-3 py-2 text-right text-xs">{c.orders}</td>
                      <td className="px-3 py-2 text-right text-xs">{brl(c.ticket)}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold">{brl(c.revenue)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.last.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {cohort && cohort.cohorts.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <div className="px-4 py-3 text-sm font-semibold border-b border-border">Cohort de retenção (% de recompra por mês de cadastro)</div>
              <table className="text-xs">
                <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 bg-muted/30">Cohort</th>
                    <th className="px-3 py-2 text-right">Tam.</th>
                    {cohort.months.map(m => <th key={m} className="px-3 py-2 text-center">{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohort.cohorts.map(c => (
                    <tr key={c.cohort} className="border-t border-border">
                      <td className="px-3 py-2 font-semibold sticky left-0 bg-card">{c.cohort}</td>
                      <td className="px-3 py-2 text-right">{c.size}</td>
                      {c.row.map(cell => {
                        const p = cell.pct;
                        const bg = p > 0 ? `rgba(37,99,235,${Math.min(0.8, p / 100)})` : "transparent";
                        const color = p > 40 ? "#fff" : "inherit";
                        return (
                          <td key={cell.month} className="px-3 py-2 text-center" style={{ background: bg, color }}>
                            {p > 0 ? `${p.toFixed(0)}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {delta !== undefined && Math.abs(delta) > 0.1 && (
        <div className={`text-xs mt-1 ${delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs. anterior
        </div>
      )}
    </div>
  );
}
