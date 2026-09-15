import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { listCoupons, upsertCoupon, deleteCoupon, couponMetrics } from "@/lib/pdv-coupons.functions";

export const Route = createFileRoute("/pdv/crm/cupons")({ component: CuponsPage });

const KINDS = [
  { v: "percent", l: "% Percentual" },
  { v: "fixed", l: "R$ Fixo" },
  { v: "shipping", l: "Frete" },
];

function CuponsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCoupons);
  const upFn = useServerFn(upsertCoupon);
  const delFn = useServerFn(deleteCoupon);
  const metricsFn = useServerFn(couponMetrics);

  const [editing, setEditing] = React.useState<any | null>(null);
  const { data: list } = useQuery({ queryKey: ["coupons"], queryFn: () => listFn() });
  const { data: metrics } = useQuery({ queryKey: ["coupons-m"], queryFn: () => metricsFn() });

  const save = useMutation({
    mutationFn: (d: any) => upFn({ data: d }),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["coupons"] }); qc.invalidateQueries({ queryKey: ["coupons-m"] }); },
  });
  const rm = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupons"] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Cupons</h2>
          <p className="text-xs text-muted-foreground">Cupons de desconto por percentual, valor fixo ou frete.</p>
        </div>
        <button onClick={() => setEditing({ code: "", kind: "percent", value: 10, min_ticket: 0, max_uses: 100, active: true })}
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">+ Novo cupom</button>
      </header>

      {metrics && (
        <div className="grid gap-3 md:grid-cols-3">
          <Kpi label="Cupons cadastrados" value={String(metrics.totalCoupons)} />
          <Kpi label="Total de resgates" value={String(metrics.totalRedeems)} />
          <Kpi label="Desconto concedido" value={`R$ ${Number(metrics.totalDiscount).toFixed(2)}`} />
        </div>
      )}

      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}
          className="rounded-xl border border-border bg-card p-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Código</span>
            <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono uppercase" required />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Tipo</span>
            <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5">
              {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Valor</span>
            <input type="number" step="0.01" value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Ticket mínimo</span>
            <input type="number" step="0.01" value={editing.min_ticket} onChange={(e) => setEditing({ ...editing, min_ticket: Number(e.target.value) })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Máx. usos</span>
            <input type="number" value={editing.max_uses} onChange={(e) => setEditing({ ...editing, max_uses: Number(e.target.value) })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Válido até</span>
            <input type="date" value={editing.valid_until ? String(editing.valid_until).slice(0, 10) : ""}
              onChange={(e) => setEditing({ ...editing, valid_until: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5" />
          </label>
          <div className="md:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="text-xs px-4 py-2 text-muted-foreground">Cancelar</button>
            <button type="submit" disabled={save.isPending} className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
              {save.isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Min. ticket</th>
              <th className="px-3 py-2 text-right">Usos</th>
              <th className="px-3 py-2 text-left">Válido até</th>
              <th className="px-3 py-2 text-center">Ativo</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list?.rows.map((c: any) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{c.code}</td>
                <td className="px-3 py-2 text-xs">{c.kind}</td>
                <td className="px-3 py-2 text-right text-xs">{c.kind === "percent" ? `${c.value}%` : `R$ ${Number(c.value).toFixed(2)}`}</td>
                <td className="px-3 py-2 text-right text-xs">R$ {Number(c.min_ticket).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-xs">{c.used_count}/{c.max_uses}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{c.valid_until ? c.valid_until.slice(0, 10) : "—"}</td>
                <td className="px-3 py-2 text-center">{c.active ? "✓" : "×"}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => setEditing(c)} className="text-xs text-muted-foreground hover:underline">Editar</button>
                  <button onClick={() => confirm("Excluir?") && rm.mutate(c.id)} className="text-xs text-destructive hover:underline">×</button>
                </td>
              </tr>
            ))}
            {list && list.rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum cupom cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
