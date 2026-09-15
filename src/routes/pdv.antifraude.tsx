import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  listFraudRules, toggleFraudRule, updateFraudRule,
  listBlocklist, addBlocklistEntry, removeBlocklistEntry,
  listFraudEvents, reviewFraudEvent, fraudStats,
} from "@/lib/pdv-fraud.functions";

export const Route = createFileRoute("/pdv/antifraude")({
  component: AntifraudePage,
});

type Tab = "rules" | "blocklist" | "events";

function AntifraudePage() {
  const [tab, setTab] = React.useState<Tab>("events");
  const statsFn = useServerFn(fraudStats);
  const { data: stats } = useQuery({ queryKey: ["fraud-stats"], queryFn: () => statsFn() });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Antifraude & Risco</h2>
        <p className="text-xs text-muted-foreground">
          Regras configuráveis, blocklist e eventos suspeitos das últimas cobranças.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Eventos 24h" value={stats?.total ?? 0} />
        <Kpi label="Bloqueados" value={stats?.blocked ?? 0} tone="destructive" />
        <Kpi label="Sinalizados" value={stats?.flagged ?? 0} tone="warning" />
        <Kpi label="Taxa bloqueio" value={`${((stats?.blockRate ?? 0) * 100).toFixed(1)}%`} />
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["events", "rules", "blocklist"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            {t === "events" ? "Eventos" : t === "rules" ? "Regras" : "Blocklist"}
          </button>
        ))}
      </div>

      {tab === "events" && <EventsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "blocklist" && <BlocklistTab />}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "destructive" | "warning" }) {
  const cls = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

/* ---------- Eventos ---------- */
function EventsTab() {
  const qc = useQueryClient();
  const [action, setAction] = React.useState<"all" | "flag" | "block" | "pending_review" | "allow">("all");
  const listFn = useServerFn(listFraudEvents);
  const reviewFn = useServerFn(reviewFraudEvent);
  const { data: rows = [] } = useQuery({
    queryKey: ["fraud-events", action],
    queryFn: () => listFn({ data: { action, limit: 100 } }),
  });
  const review = useMutation({
    mutationFn: (v: { eventId: string; approve: boolean; note?: string }) => reviewFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fraud-events"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["all", "pending_review", "block", "flag", "allow"] as const).map((a) => (
          <button key={a} onClick={() => setAction(a)}
            className={`rounded-md border px-3 py-1.5 text-xs ${action === a ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
            {a === "all" ? "Todos" : a === "pending_review" ? "A revisar" : a === "block" ? "Bloqueados" : a === "flag" ? "Sinalizados" : "Aprovados"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Quando</th>
              <th className="px-3 py-2 text-left">Origem</th>
              <th className="px-3 py-2 text-left">CPF/Tel</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-left">Ação</th>
              <th className="px-3 py-2 text-left">Motivos</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-xs">{r.source_type}<br /><span className="text-muted-foreground">{r.source_id ?? "—"}</span></td>
                <td className="px-3 py-2 text-xs">{r.cpf ?? r.phone ?? r.email ?? "—"}</td>
                <td className="px-3 py-2 text-right text-xs">{r.amount ? `R$ ${Number(r.amount).toFixed(2)}` : "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.score}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                    r.action_taken === "block" ? "bg-destructive/15 text-destructive"
                    : r.action_taken === "pending_review" ? "bg-amber-500/15 text-amber-700"
                    : r.action_taken === "flag" ? "bg-yellow-500/15 text-yellow-700"
                    : "bg-emerald-500/15 text-emerald-700"
                  }`}>{r.action_taken}</span>
                </td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground">
                  {(r.reasons ?? []).map((x: any) => x.ruleName).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.action_taken === "pending_review" && (
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => review.mutate({ eventId: r.id, approve: true })}
                        className="rounded bg-emerald-600 px-2 py-1 text-[11px] text-white">Aprovar</button>
                      <button onClick={() => review.mutate({ eventId: r.id, approve: false })}
                        className="rounded bg-destructive px-2 py-1 text-[11px] text-white">Bloquear</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhum evento.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Regras ---------- */
function RulesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFraudRules);
  const toggleFn = useServerFn(toggleFraudRule);
  const updateFn = useServerFn(updateFraudRule);
  const { data: rules = [] } = useQuery({ queryKey: ["fraud-rules"], queryFn: () => listFn() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fraud-rules"] });

  return (
    <div className="space-y-3">
      {rules.map((r: any) => (
        <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[240px]">
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">Tipo: {r.rule_type} · Peso {r.weight}</div>
          </div>
          {r.threshold !== null && (
            <label className="text-xs">Threshold
              <input type="number" defaultValue={r.threshold ?? ""}
                onBlur={(e) => updateFn({ data: { ruleId: r.id, threshold: Number(e.target.value) } }).then(invalidate)}
                className="ml-2 w-24 rounded border border-border bg-background px-2 py-1" />
            </label>
          )}
          {r.window_minutes !== null && (
            <label className="text-xs">Janela (min)
              <input type="number" defaultValue={r.window_minutes ?? ""}
                onBlur={(e) => updateFn({ data: { ruleId: r.id, windowMinutes: Number(e.target.value) } }).then(invalidate)}
                className="ml-2 w-20 rounded border border-border bg-background px-2 py-1" />
            </label>
          )}
          <select defaultValue={r.action}
            onChange={(e) => updateFn({ data: { ruleId: r.id, action: e.target.value as any } }).then(invalidate)}
            className="rounded border border-border bg-background px-2 py-1 text-xs">
            <option value="flag">Sinalizar</option>
            <option value="block">Bloquear</option>
            <option value="notify">Notificar</option>
          </select>
          <button onClick={() => toggleFn({ data: { ruleId: r.id, enabled: !r.enabled } }).then(invalidate)}
            className={`rounded px-3 py-1.5 text-xs font-medium ${r.enabled ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
            {r.enabled ? "Ativa" : "Desativada"}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Blocklist ---------- */
function BlocklistTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBlocklist);
  const addFn = useServerFn(addBlocklistEntry);
  const removeFn = useServerFn(removeBlocklistEntry);
  const { data: rows = [] } = useQuery({ queryKey: ["fraud-blocklist"], queryFn: () => listFn() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fraud-blocklist"] });

  const [kind, setKind] = React.useState<"cpf" | "email" | "phone" | "ip">("cpf");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");

  return (
    <div className="space-y-4">
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        await addFn({ data: { kind, value, reason: reason || undefined } });
        setValue(""); setReason(""); invalidate();
      }} className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4">
        <select value={kind} onChange={(e) => setKind(e.target.value as any)}
          className="rounded border border-border bg-background px-2 py-2 text-sm">
          <option value="cpf">CPF</option>
          <option value="email">Email</option>
          <option value="phone">Telefone</option>
          <option value="ip">IP</option>
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Valor"
          className="flex-1 min-w-[200px] rounded border border-border bg-background px-3 py-2 text-sm" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)"
          className="flex-1 min-w-[200px] rounded border border-border bg-background px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Adicionar</button>
      </form>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Valor</th>
              <th className="px-3 py-2 text-left">Motivo</th>
              <th className="px-3 py-2 text-left">Origem</th>
              <th className="px-3 py-2 text-left">Criado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-xs uppercase">{r.kind}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.value}</td>
                <td className="px-3 py-2 text-xs">{r.reason ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.auto_added ? "Automática" : "Manual"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => removeFn({ data: { id: r.id } }).then(invalidate)}
                    className="text-xs text-destructive hover:underline">Remover</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhuma entrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
