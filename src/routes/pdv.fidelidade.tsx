import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { getLoyaltyRule, updateLoyaltyRule, listLoyaltyAccounts, getLoyaltyStatement } from "@/lib/pdv-loyalty.functions";
import { useCurrentStore } from "@/lib/pdv-current-store";

export const Route = createFileRoute("/pdv/fidelidade")({ component: FidelidadePage });

function brl(n: number) { return `R$ ${Number(n || 0).toFixed(2)}`; }

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-700/20 text-amber-800",
  prata: "bg-slate-400/20 text-slate-700",
  ouro: "bg-yellow-500/20 text-yellow-800",
  diamante: "bg-cyan-500/20 text-cyan-800",
};

function FidelidadePage() {
  const [tab, setTab] = React.useState<"accounts" | "rules" | "statement">("accounts");
  const [selCust, setSelCust] = React.useState<string | null>(null);
  const { currentStoreId } = useCurrentStore();

  const qc = useQueryClient();
  const ruleFn = useServerFn(getLoyaltyRule);
  const updRuleFn = useServerFn(updateLoyaltyRule);
  const accsFn = useServerFn(listLoyaltyAccounts);
  const stmtFn = useServerFn(getLoyaltyStatement);

  const { data: rule } = useQuery({ 
    queryKey: ["loyal-rule", currentStoreId], 
    queryFn: () => ruleFn({ data: { store_id: currentStoreId! } }),
    enabled: !!currentStoreId
  });
  const { data: accs } = useQuery({ 
    queryKey: ["loyal-accs", currentStoreId], 
    queryFn: () => accsFn({ data: { store_id: currentStoreId! } }),
    enabled: !!currentStoreId
  });
  const { data: stmt } = useQuery({
    queryKey: ["loyal-stmt", selCust, currentStoreId], 
    enabled: !!selCust && !!currentStoreId,
    queryFn: () => stmtFn({ data: { customer_id: selCust!, store_id: currentStoreId! } }),
  });

  const saveRule = useMutation({
    mutationFn: (d: any) => updRuleFn({ data: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyal-rule"] }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Programa de Fidelidade</h2>
        <p className="text-xs text-muted-foreground">Pontos, tiers e resgates dos seus clientes.</p>
      </header>

      <div className="flex gap-2 border-b border-border">
        {(["accounts", "rules", "statement"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {t === "accounts" ? "Contas" : t === "rules" ? "Regras" : "Extrato"}
          </button>
        ))}
      </div>

      {tab === "accounts" && accs && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">CPF</th>
                <th className="px-3 py-2 text-center">Tier</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">Vitalícios</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {accs.rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs">{r.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.customers?.cpf ?? ""}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${TIER_COLORS[r.tier] ?? ""}`}>{r.tier}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{r.balance}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.lifetime_points}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => { setSelCust(r.customer_id); setTab("statement"); }}
                      className="text-xs text-primary hover:underline">Extrato</button>
                  </td>
                </tr>
              ))}
              {accs.rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma conta ainda. Pontos são gerados no fechamento de vendas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "rules" && rule?.rule && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const payload: any = { id: (rule.rule as any).id, store_id: currentStoreId };
          for (const [k, v] of f.entries()) payload[k] = Number(v);
          saveRule.mutate(payload);
        }} className="grid gap-3 md:grid-cols-3 rounded-xl border border-border bg-card p-4">
          {[
            ["points_per_brl", "Pontos por R$"],
            ["brl_per_point", "R$ por ponto (resgate)"],
            ["expiration_months", "Validade (meses)"],
            ["tier_prata_threshold", "Prata a partir de (pts)"],
            ["tier_ouro_threshold", "Ouro a partir de (pts)"],
            ["tier_diamante_threshold", "Diamante a partir de (pts)"],
            ["tier_prata_multiplier", "Multiplicador Prata"],
            ["tier_ouro_multiplier", "Multiplicador Ouro"],
            ["tier_diamante_multiplier", "Multiplicador Diamante"],
          ].map(([name, label]) => (
            <label key={name} className="text-xs space-y-1">
              <span className="text-muted-foreground">{label}</span>
              <input name={name} type="number" step="0.01" defaultValue={(rule.rule as any)[name]}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5" />
            </label>
          ))}
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" disabled={saveRule.isPending}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
              {saveRule.isPending ? "Salvando..." : "Salvar regra"}
            </button>
          </div>
        </form>
      )}

      {tab === "statement" && (
        <div className="space-y-3">
          {!selCust && <p className="text-sm text-muted-foreground">Selecione um cliente na aba Contas.</p>}
          {stmt && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Kpi label="Saldo" value={String(stmt.account.balance)} />
                <Kpi label="Vitalícios" value={String(stmt.account.lifetime_points)} />
                <Kpi label="Tier" value={String(stmt.account.tier)} />
                <Kpi label="Próximo tier" value={stmt.nextThreshold ? `${stmt.nextThreshold} pts` : "Máximo"} />
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-right">Pontos</th>
                      <th className="px-3 py-2 text-left">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stmt.entries.map((e: any) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-3 py-2">{e.created_at.slice(0, 10)}</td>
                        <td className="px-3 py-2">{e.kind}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${e.points >= 0 ? "text-emerald-600" : "text-destructive"}`}>{e.points > 0 ? "+" : ""}{e.points}</td>
                        <td className="px-3 py-2">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold capitalize">{value}</div>
    </div>
  );
}
