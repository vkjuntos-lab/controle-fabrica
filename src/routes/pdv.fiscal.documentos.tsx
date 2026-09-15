import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { listFiscalDocs, cancelFiscalDoc, resendPendingDocs } from "@/lib/pdv-fiscal.functions";

export const Route = createFileRoute("/pdv/fiscal/documentos")({ component: DocsPage });

const STATUS_COLORS: Record<string, string> = {
  authorized: "bg-emerald-500/20 text-emerald-700",
  processing: "bg-blue-500/20 text-blue-700",
  pending: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/20 text-destructive",
  cancelled: "bg-slate-500/20 text-slate-700",
  contingency: "bg-amber-500/20 text-amber-800",
  inutilized: "bg-slate-400/20 text-slate-600",
};

function DocsPage() {
  const [status, setStatus] = React.useState<string>("");
  const [days, setDays] = React.useState(30);

  const qc = useQueryClient();
  const listFn = useServerFn(listFiscalDocs);
  const cancelFn = useServerFn(cancelFiscalDoc);
  const resendFn = useServerFn(resendPendingDocs);

  const { data } = useQuery({
    queryKey: ["fiscal-docs", status, days],
    queryFn: () => listFn({ data: { status: status || undefined, days } }),
  });

  const cancel = useMutation({
    mutationFn: ({ id, motivo }: any) => cancelFn({ data: { id, motivo } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-docs"] }),
  });
  const resend = useMutation({
    mutationFn: () => resendFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-docs"] }),
  });

  const contingencyCount = data?.rows.filter((d: any) => d.status === "contingency").length ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Documentos Fiscais</h2>
          <p className="text-xs text-muted-foreground">NFC-e, NF-e, CF-e-SAT emitidos.</p>
        </div>
        {contingencyCount > 0 && (
          <div className="rounded-lg bg-amber-500/20 text-amber-800 px-3 py-1.5 text-xs font-medium">
            🟠 {contingencyCount} em contingência
          </div>
        )}
      </header>

      <div className="flex gap-2 items-center">
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs">
          <option value="">Todos status</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs">
          {[7, 30, 60, 90, 180].map(d => <option key={d} value={d}>Últimos {d} dias</option>)}
        </select>
        <button onClick={() => resend.mutate()} disabled={resend.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          {resend.isPending ? "Reenviando..." : "Reenviar fila"}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Emitido</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Série/Nº</th>
              <th className="px-3 py-2 text-left">Chave</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-center">DANFE</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((d: any) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-3 py-2">{(d.emitted_at ?? d.created_at).slice(0, 16).replace("T", " ")}</td>
                <td className="px-3 py-2 uppercase">{d.kind}</td>
                <td className="px-3 py-2">{d.serie}/{d.numero}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{d.chave ?? "—"}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[d.status] ?? ""}`}>{d.status}</span>
                </td>
                <td className="px-3 py-2 text-right">R$ {Number(d.total_value).toFixed(2)}</td>
                <td className="px-3 py-2 text-center">
                  {d.danfe_url ? <a href={d.danfe_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">PDF</a> : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {d.status === "authorized" && (
                    <button onClick={() => {
                      const motivo = prompt("Justificativa (mín 15 chars):");
                      if (motivo && motivo.length >= 15) cancel.mutate({ id: d.id, motivo });
                      else if (motivo) alert("Justificativa muito curta.");
                    }} className="text-destructive hover:underline">Cancelar</button>
                  )}
                  {d.error_msg && <div className="text-[10px] text-destructive mt-0.5">{d.error_msg}</div>}
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum documento no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
