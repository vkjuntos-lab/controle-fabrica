import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, FileText } from "lucide-react";

export const Route = createFileRoute("/pdv/financeiro_/dre")({
  component: DreRoute,
});

type DreRow = { category_id: string | null; category_name: string; kind: "income" | "expense"; total: number };
type AbcRow = { supplier: string; total: number; share: number };

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function monthEnd() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function DreRoute() {
  const { currentStoreId, currentStore, loading } = useCurrentStore();
  const [from, setFrom] = React.useState(monthStart());
  const [to, setTo] = React.useState(monthEnd());
  const [dre, setDre] = React.useState<DreRow[]>([]);
  const [abc, setAbc] = React.useState<AbcRow[]>([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!currentStoreId) return;
    setBusy(true);
    const fromTs = `${from}T00:00:00`;
    const toTs = `${to}T23:59:59`;
    const [d, a] = await Promise.all([
      supabase.rpc("dre_by_category", { _store_id: currentStoreId, _from: fromTs, _to: toTs }),
      supabase.rpc("abc_suppliers", { _store_id: currentStoreId, _from: fromTs, _to: toTs }),
    ]);
    if (d.error) console.error(d.error);
    if (a.error) console.error(a.error);
    setDre((d.data ?? []).map((r: DreRow) => ({ ...r, total: Number(r.total) })));
    setAbc((a.data ?? []).map((r: AbcRow) => ({ ...r, total: Number(r.total), share: Number(r.share) })));
    setBusy(false);
  }, [currentStoreId, from, to]);

  React.useEffect(() => { void load(); }, [load]);

  const income = dre.filter((r) => r.kind === "income");
  const expense = dre.filter((r) => r.kind === "expense");
  const totalIn = income.reduce((s, r) => s + r.total, 0);
  const totalOut = expense.reduce((s, r) => s + r.total, 0);
  const result = totalIn - totalOut;

  // Curva ABC: acumulado
  let acc = 0;
  const abcWithClass = abc.map((r) => {
    acc += r.share;
    const klass = acc <= 0.8 ? "A" : acc <= 0.95 ? "B" : "C";
    return { ...r, acc, klass };
  });

  function exportCsv() {
    const lines = [
      `DRE ${currentStore?.name} — ${from} a ${to}`,
      "Tipo;Categoria;Total",
      ...income.map((r) => `Receita;${r.category_name};${r.total.toFixed(2)}`),
      ...expense.map((r) => `Despesa;${r.category_name};${r.total.toFixed(2)}`),
      `;Total Receitas;${totalIn.toFixed(2)}`,
      `;Total Despesas;${totalOut.toFixed(2)}`,
      `;Resultado;${result.toFixed(2)}`,
      "",
      "Curva ABC de fornecedores",
      "Fornecedor;Total;Participação;Acumulado;Classe",
      ...abcWithClass.map((r) => `${r.supplier};${r.total.toFixed(2)};${(r.share * 100).toFixed(2)}%;${(r.acc * 100).toFixed(2)}%;${r.klass}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dre-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const doc = new jsPDF();
    let y = 15;
    doc.setFontSize(14);
    doc.text(`DRE — ${currentStore?.name ?? ""}`, 14, y); y += 6;
    doc.setFontSize(10);
    doc.text(`Período: ${from} a ${to}`, 14, y); y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Receitas", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    income.forEach((r) => { doc.text(r.category_name, 16, y); doc.text(brl(r.total), 190, y, { align: "right" }); y += 5; });
    doc.setFont("helvetica", "bold");
    doc.text(`Total receitas: ${brl(totalIn)}`, 190, y, { align: "right" }); y += 8;

    doc.text("Despesas", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    expense.forEach((r) => { doc.text(r.category_name, 16, y); doc.text(brl(r.total), 190, y, { align: "right" }); y += 5; });
    doc.setFont("helvetica", "bold");
    doc.text(`Total despesas: ${brl(totalOut)}`, 190, y, { align: "right" }); y += 8;
    doc.text(`Resultado: ${brl(result)}`, 190, y, { align: "right" }); y += 12;

    if (abcWithClass.length > 0) {
      doc.text("Curva ABC — Fornecedores", 14, y); y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Fornecedor", 14, y);
      doc.text("Total", 120, y, { align: "right" });
      doc.text("Part.", 150, y, { align: "right" });
      doc.text("Acum.", 175, y, { align: "right" });
      doc.text("Cls", 195, y, { align: "right" });
      y += 4;
      abcWithClass.forEach((r) => {
        if (y > 280) { doc.addPage(); y = 15; }
        doc.text(r.supplier.slice(0, 40), 14, y);
        doc.text(brl(r.total), 120, y, { align: "right" });
        doc.text(`${(r.share * 100).toFixed(1)}%`, 150, y, { align: "right" });
        doc.text(`${(r.acc * 100).toFixed(1)}%`, 175, y, { align: "right" });
        doc.text(r.klass, 195, y, { align: "right" });
        y += 5;
      });
    }
    doc.save(`dre-${from}-a-${to}.pdf`);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (!currentStoreId) {
    return <div className="text-center text-sm text-muted-foreground">Selecione uma loja no cabeçalho.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link to="/pdv/financeiro"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">DRE e Curva ABC</h1>
          </div>
          <p className="text-sm text-muted-foreground">{currentStore?.name} — receitas e despesas por categoria.</p>
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
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={dre.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={dre.length === 0}>
            <FileText className="mr-1.5 h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Receitas</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DreTable rows={income} total={totalIn} totalLabel="Total receitas" tone="pos" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Despesas</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DreTable rows={expense} total={totalOut} totalLabel="Total despesas" tone="neg" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <span className="text-sm font-medium">Resultado do período</span>
          <span className={`text-xl font-semibold ${result >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {brl(result)}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Curva ABC de fornecedores</CardTitle></CardHeader>
        <CardContent className="p-0">
          {busy ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : abcWithClass.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conta baixada no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Fornecedor</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Participação</th>
                    <th className="px-3 py-2 text-right">Acumulado</th>
                    <th className="px-3 py-2 text-center">Classe</th>
                  </tr>
                </thead>
                <tbody>
                  {abcWithClass.map((r) => (
                    <tr key={r.supplier} className="border-t border-border/60">
                      <td className="px-3 py-2">{r.supplier}</td>
                      <td className="px-3 py-2 text-right">{brl(r.total)}</td>
                      <td className="px-3 py-2 text-right">{(r.share * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right">{(r.acc * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                          r.klass === "A" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : r.klass === "B" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"}`}>
                          {r.klass}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DreTable({ rows, total, totalLabel, tone }: { rows: DreRow[]; total: number; totalLabel: string; tone: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 && (
            <tr><td className="px-3 py-4 text-center text-xs text-muted-foreground">Sem lançamentos.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={(r.category_id ?? "null") + r.kind} className="border-t border-border/60">
              <td className="px-3 py-2">{r.category_name}</td>
              <td className={`px-3 py-2 text-right ${color}`}>{brl(r.total)}</td>
            </tr>
          ))}
          <tr className="border-t border-border bg-muted/30 font-semibold">
            <td className="px-3 py-2">{totalLabel}</td>
            <td className={`px-3 py-2 text-right ${color}`}>{brl(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
