import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Download, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
  Area,
  AreaChart,
} from "recharts";
import {
  COST_CENTER_KINDS,
  budgetUsage,
  cashflowByCostCenter,
  cashflowHistory,
  cashflowProjection,
  deleteCostCenter,
  downloadCsv,
  firstNegativeDay,
  listCostCenters,
  toCsv,
  upsertCostCenter,
  type CostCenter,
  type CostCenterKind,
  type CostCenterRow,
  type HistoryRow,
  type ProjectionRow,
} from "@/lib/pdv-cashflow";

export const Route = createFileRoute("/pdv/financeiro_/fluxo")({
  component: CashflowRoute,
});

type Row = {
  day: string;
  realized_in: number;
  realized_out: number;
  forecast_in: number;
  forecast_out: number;
};

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function CashflowRoute() {
  const { currentStoreId, currentStore, loading } = useCurrentStore();
  const [from, setFrom] = React.useState(todayISO(-14));
  const [to, setTo] = React.useState(todayISO(30));
  const [rows, setRows] = React.useState<Row[]>([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!currentStoreId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("cashflow_daily", {
      _store_id: currentStoreId,
      _from: from,
      _to: to,
    });
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows(
        ((data ?? []) as Row[]).map((r) => ({
          ...r,
          realized_in: Number(r.realized_in) || 0,
          realized_out: Number(r.realized_out) || 0,
          forecast_in: Number(r.forecast_in) || 0,
          forecast_out: Number(r.forecast_out) || 0,
        })),
      );
    }
    setBusy(false);
  }, [currentStoreId, from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const chartData = rows.map((r) => ({
    day: r.day.slice(5),
    Realizado: r.realized_in - r.realized_out,
    Previsto: r.forecast_in - r.forecast_out,
    Entradas: r.realized_in,
    Saídas: -r.realized_out,
  }));

  const totals = rows.reduce(
    (acc, r) => {
      acc.rin += r.realized_in;
      acc.rout += r.realized_out;
      acc.fin += r.forecast_in;
      acc.fout += r.forecast_out;
      return acc;
    },
    { rin: 0, rout: 0, fin: 0, fout: 0 },
  );

  function exportCsv() {
    const csv = toCsv(
      [
        "Dia",
        "Realizado Entrada",
        "Realizado Saída",
        "Previsto Entrada",
        "Previsto Saída",
        "Saldo Realizado",
        "Saldo Previsto",
      ],
      rows.map((r) => [
        r.day,
        r.realized_in.toFixed(2),
        r.realized_out.toFixed(2),
        r.forecast_in.toFixed(2),
        r.forecast_out.toFixed(2),
        (r.realized_in - r.realized_out).toFixed(2),
        (r.forecast_in - r.forecast_out).toFixed(2),
      ]),
    );
    downloadCsv(`fluxo-caixa-${from}-a-${to}.csv`, csv);
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!currentStoreId) {
    return (
      <div className="mx-auto max-w-lg space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          Selecione uma loja no cabeçalho para ver o fluxo de caixa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link to="/pdv/financeiro" aria-label="Voltar para o financeiro">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Fluxo de caixa</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {currentStore?.name} — previsto vs realizado.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard title="Entradas realizadas" value={totals.rin} tone="pos" />
        <SummaryCard title="Saídas realizadas" value={totals.rout} tone="neg" />
        <SummaryCard title="Entradas previstas" value={totals.fin} tone="pos-soft" />
        <SummaryCard title="Saídas previstas" value={totals.fout} tone="neg-soft" />
      </div>

      <Tabs defaultValue="diario">
        <TabsList>
          <TabsTrigger value="diario">Diário</TabsTrigger>
          <TabsTrigger value="centros">Centros de custo</TabsTrigger>
          <TabsTrigger value="previsao">Previsão</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="diario" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldo diário</CardTitle>
            </CardHeader>
            <CardContent>
              {busy ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Carregando…</div>
              ) : chartData.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  Sem movimentações no período.
                </div>
              ) : (
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="day" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => brl(v as number)} width={90} />
                      <Tooltip formatter={(v: number) => brl(v)} />
                      <Legend />
                      <Bar dataKey="Entradas" stackId="a" fill="hsl(142 76% 45%)" />
                      <Bar dataKey="Saídas" stackId="a" fill="hsl(0 72% 55%)" />
                      <Line type="monotone" dataKey="Realizado" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                      <Line
                        type="monotone"
                        dataKey="Previsto"
                        stroke="hsl(280 60% 60%)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento por dia</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Dia</th>
                      <th className="px-3 py-2 text-right">Realizado ↑</th>
                      <th className="px-3 py-2 text-right">Realizado ↓</th>
                      <th className="px-3 py-2 text-right">Previsto ↑</th>
                      <th className="px-3 py-2 text-right">Previsto ↓</th>
                      <th className="px-3 py-2 text-right">Saldo real</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const saldo = r.realized_in - r.realized_out;
                      return (
                        <tr key={r.day} className="border-t border-border/60">
                          <td className="px-3 py-2">{r.day}</td>
                          <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                            {brl(r.realized_in)}
                          </td>
                          <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400">
                            {brl(r.realized_out)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{brl(r.forecast_in)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{brl(r.forecast_out)}</td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${
                              saldo >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {brl(saldo)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="centros">
          <CostCentersPanel storeId={currentStoreId} from={from} to={to} />
        </TabsContent>

        <TabsContent value="previsao">
          <ProjectionPanel storeId={currentStoreId} />
        </TabsContent>

        <TabsContent value="historico">
          <HistoryPanel storeId={currentStoreId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Centros de custo ---------------- */

function CostCentersPanel({ storeId, from, to }: { storeId: string; from: string; to: string }) {
  const [centers, setCenters] = React.useState<CostCenter[]>([]);
  const [report, setReport] = React.useState<CostCenterRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<{
    name: string;
    code: string;
    kind: CostCenterKind;
    monthly_budget: string;
  }>({ name: "", code: "", kind: "operacional", monthly_budget: "" });

  const load = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [cs, rep] = await Promise.all([
        listCostCenters(storeId, { includeInactive: true }),
        cashflowByCostCenter(storeId, from, to),
      ]);
      setCenters(cs);
      setReport(rep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar centros de custo.");
    } finally {
      setBusy(false);
    }
  }, [storeId, from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await upsertCostCenter({
        store_id: storeId,
        name: form.name.trim(),
        code: form.code.trim() || null,
        kind: form.kind,
        monthly_budget: Number(form.monthly_budget || 0),
      });
      setForm({ name: "", code: "", kind: "operacional", monthly_budget: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar centro de custo.");
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este centro de custo? Os lançamentos ficam sem alocação.")) return;
    try {
      await deleteCostCenter(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir.");
    }
  }

  function exportCsv() {
    const csv = toCsv(
      ["Centro de custo", "Tipo", "Orçamento", "Entradas", "Saídas", "Previsto entrada", "Previsto saída", "Saldo"],
      report.map((r) => [
        r.cost_center_name,
        r.kind,
        r.monthly_budget.toFixed(2),
        r.realized_in.toFixed(2),
        r.realized_out.toFixed(2),
        r.forecast_in.toFixed(2),
        r.forecast_out.toFixed(2),
        r.net.toFixed(2),
      ]),
    );
    downloadCsv(`centros-de-custo-${from}-a-${to}.csv`, csv);
  }

  const totalOut = report.reduce((s, r) => s + r.realized_out, 0);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Consolidado por centro de custo</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={report.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Centro de custo</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Entradas</th>
                  <th className="px-3 py-2 text-right">Saídas</th>
                  <th className="px-3 py-2 text-right">Previsto ↓</th>
                  <th className="px-3 py-2 text-right">% das saídas</th>
                  <th className="px-3 py-2 text-left">Orçamento</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => {
                  const usage = budgetUsage(r);
                  const share = totalOut > 0 ? (r.realized_out / totalOut) * 100 : 0;
                  return (
                    <tr key={r.cost_center_id ?? "sem-alocacao"} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">{r.cost_center_name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {r.kind}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                        {brl(r.realized_in)}
                      </td>
                      <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400">
                        {brl(r.realized_out)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{brl(r.forecast_out)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{share.toFixed(1)}%</td>
                      <td className="px-3 py-2">
                        {usage === null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-1">
                            <Progress value={Math.min(usage, 100)} className="h-1.5" />
                            <span
                              className={`text-[10px] ${
                                usage > 100 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                              }`}
                            >
                              {usage.toFixed(0)}% de {brl(r.monthly_budget)}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {report.length === 0 && !busy && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Cadastre centros de custo para detalhar o fluxo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastro de centros de custo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label className="text-xs">Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Marketing digital"
                className="h-9"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Código</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="CC-01"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as CostCenterKind })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Tipo do centro de custo"
              >
                {COST_CENTER_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Orçamento mensal</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.monthly_budget}
                onChange={(e) => setForm({ ...form, monthly_budget: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="md:col-span-5">
              <Button type="submit" size="sm" disabled={busy}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Adicionar centro de custo
              </Button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Orçamento</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {centers.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.code ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.kind}</td>
                    <td className="px-3 py-2 text-right">{brl(c.monthly_budget)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Excluir centro de custo ${c.name}`}
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {centers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum centro de custo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Previsão ---------------- */

function ProjectionPanel({ storeId }: { storeId: string }) {
  const [days, setDays] = React.useState(90);
  const [rows, setRows] = React.useState<ProjectionRow[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setBusy(true);
    cashflowProjection(storeId, days)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, days]);

  const alert = firstNegativeDay(rows);
  const last = rows[rows.length - 1];
  const chart = rows.map((r) => ({
    day: r.day.slice(5),
    Saldo: r.running_balance,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[30, 60, 90, 180].map((d) => (
          <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
            {d} dias
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              `previsao-fluxo-${days}d.csv`,
              toCsv(
                ["Dia", "Entradas previstas", "Saídas previstas", "Saldo do dia", "Saldo acumulado"],
                rows.map((r) => [
                  r.day,
                  r.expected_in.toFixed(2),
                  r.expected_out.toFixed(2),
                  r.net.toFixed(2),
                  r.running_balance.toFixed(2),
                ]),
              ),
            )
          }
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          CSV
        </Button>
      </div>

      {alert && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Saldo projetado fica negativo em {alert.day} ({brl(alert.running_balance)}). Antecipe recebimentos ou
          renegocie pagamentos.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard title="Entradas previstas" value={rows.reduce((s, r) => s + r.expected_in, 0)} tone="pos-soft" />
        <SummaryCard title="Saídas previstas" value={rows.reduce((s, r) => s + r.expected_out, 0)} tone="neg-soft" />
        <SummaryCard
          title="Saldo projetado final"
          value={last?.running_balance ?? 0}
          tone={(last?.running_balance ?? 0) >= 0 ? "pos" : "neg"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projeção de saldo</CardTitle>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : chart.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Sem previsões no período.</div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => brl(v as number)} width={90} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="Saldo"
                    stroke="hsl(217 91% 60%)"
                    fill="hsl(217 91% 60% / 0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Histórico ---------------- */

function HistoryPanel({ storeId }: { storeId: string }) {
  const [months, setMonths] = React.useState(12);
  const [rows, setRows] = React.useState<HistoryRow[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setBusy(true);
    cashflowHistory(storeId, months)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, months]);

  const chart = rows.map((r) => ({
    month: r.month.slice(0, 7),
    Entradas: r.realized_in,
    Saídas: -r.realized_out,
    Acumulado: r.accumulated,
  }));

  const best = rows.reduce<HistoryRow | null>((b, r) => (!b || r.net > b.net ? r : b), null);
  const worst = rows.reduce<HistoryRow | null>((b, r) => (!b || r.net < b.net ? r : b), null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[6, 12, 24].map((m) => (
          <Button key={m} variant={months === m ? "default" : "outline"} size="sm" onClick={() => setMonths(m)}>
            {m} meses
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              `historico-fluxo-${months}m.csv`,
              toCsv(
                ["Mês", "Entradas", "Saídas", "Resultado", "Acumulado"],
                rows.map((r) => [
                  r.month.slice(0, 7),
                  r.realized_in.toFixed(2),
                  r.realized_out.toFixed(2),
                  r.net.toFixed(2),
                  r.accumulated.toFixed(2),
                ]),
              ),
            )
          }
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard title="Total de entradas" value={rows.reduce((s, r) => s + r.realized_in, 0)} tone="pos" />
        <SummaryCard title="Total de saídas" value={rows.reduce((s, r) => s + r.realized_out, 0)} tone="neg" />
        <SummaryCard
          title="Resultado acumulado"
          value={rows[rows.length - 1]?.accumulated ?? 0}
          tone={(rows[rows.length - 1]?.accumulated ?? 0) >= 0 ? "pos" : "neg"}
        />
      </div>

      {best && worst && (
        <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded-md border border-border/60 px-3 py-2">
            Melhor mês: <strong>{best.month.slice(0, 7)}</strong> ({brl(best.net)})
          </div>
          <div className="rounded-md border border-border/60 px-3 py-2">
            Pior mês: <strong>{worst.month.slice(0, 7)}</strong> ({brl(worst.net)})
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico consolidado</CardTitle>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : chart.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Sem histórico disponível.</div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => brl(v as number)} width={90} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <Bar dataKey="Entradas" fill="hsl(142 76% 45%)" />
                  <Bar dataKey="Saídas" fill="hsl(0 72% 55%)" />
                  <Line type="monotone" dataKey="Acumulado" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Mês</th>
                  <th className="px-3 py-2 text-right">Entradas</th>
                  <th className="px-3 py-2 text-right">Saídas</th>
                  <th className="px-3 py-2 text-right">Resultado</th>
                  <th className="px-3 py-2 text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-t border-border/60">
                    <td className="px-3 py-2">{r.month.slice(0, 7)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                      {brl(r.realized_in)}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400">{brl(r.realized_out)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        r.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {brl(r.net)}
                    </td>
                    <td className="px-3 py-2 text-right">{brl(r.accumulated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "pos" | "neg" | "pos-soft" | "neg-soft";
}) {
  const color =
    tone === "pos"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "neg"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "pos-soft"
          ? "text-emerald-600/70"
          : "text-rose-600/70";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`mt-1 text-xl font-semibold ${color}`}>{brl(value)}</div>
      </CardContent>
    </Card>
  );
}
