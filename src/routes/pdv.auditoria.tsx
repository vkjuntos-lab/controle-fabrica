import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { listAudit, type AuditRow } from "@/lib/pdv-audit";
import { usePdvAuth } from "@/lib/pdv-auth";
import { useServerFn } from "@tanstack/react-start";
import { logSecurityEvent } from "@/lib/pdv-security-events.functions";
import { ShieldCheck, RefreshCw, ShieldAlert, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/pdv/auditoria")({
  component: AuditoriaPage,
});

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Login",
  "auth.login_failed": "Login falhou",
  "auth.logout": "Logout",
  "cashier.open": "Abertura de caixa",
  "cashier.close": "Fechamento de caixa",
  "sale.create": "Venda registrada",
  "user.create": "Usuário criado",
  "user.delete": "Usuário removido",
  "user.reset_pin": "PIN redefinido",
  "security.rls_change": "Mudança de RLS",
  "security.webhook_secret_rotation": "Rotação de segredo (webhook)",
  "security.cron_secret_rotation": "Rotação de segredo (cron)",
  "security.policy_review": "Revisão de política",
  "security.event": "Evento de segurança",
};

const ACTION_TONE: Record<string, string> = {
  "auth.login": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "auth.login_failed": "bg-destructive/10 text-destructive",
  "auth.logout": "bg-muted text-muted-foreground",
  "cashier.open": "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "cashier.close": "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  "security.rls_change": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "security.webhook_secret_rotation": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "security.cron_secret_rotation": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "security.policy_review": "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "security.event": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

type SecurityKind =
  | "rls_change"
  | "webhook_secret_rotation"
  | "cron_secret_rotation"
  | "policy_review"
  | "other";

function AuditoriaPage() {
  const { user } = usePdvAuth();
  const [rows, setRows] = React.useState<AuditRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<"all" | "security">("all");

  const [secKind, setSecKind] = React.useState<SecurityKind>("webhook_secret_rotation");
  const [secSummary, setSecSummary] = React.useState("");
  const [secEntity, setSecEntity] = React.useState("");
  const [secSaving, setSecSaving] = React.useState(false);

  const logSecFn = useServerFn(logSecurityEvent);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAudit(200);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = rows;
    if (tab === "security") base = base.filter((r) => r.action.startsWith("security."));
    if (!s) return base;
    return base.filter(
      (r) =>
        r.action.toLowerCase().includes(s) ||
        (r.actor_name ?? "").toLowerCase().includes(s) ||
        (r.entity ?? "").toLowerCase().includes(s),
    );
  }, [rows, q, tab]);

  const canSee = user?.role === "admin" || user?.role === "manager";
  if (!canSee) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Acesso restrito ao administrador ou gerente.
      </div>
    );
  }

  const submitSecurity = async () => {
    if (secSummary.trim().length < 3) {
      toast.error("Descreva o evento em pelo menos 3 caracteres.");
      return;
    }
    setSecSaving(true);
    try {
      await logSecFn({
        data: {
          kind: secKind,
          summary: secSummary.trim(),
          entity: secEntity.trim() || null,
        },
      });
      toast.success("Evento de segurança registrado.");
      setSecSummary("");
      setSecEntity("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar evento.");
    } finally {
      setSecSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Segurança
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Registro de auditoria
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Logins, aberturas/fechamentos de caixa, ações sensíveis e eventos de segurança.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar por ação, usuário…"
            className="h-9 w-56"
          />
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </header>

      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 text-sm">
        <button
          onClick={() => setTab("all")}
          className={`rounded-md px-3 py-1.5 transition ${tab === "all" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
        >
          Todos ({rows.length})
        </button>
        <button
          onClick={() => setTab("security")}
          className={`rounded-md px-3 py-1.5 transition ${tab === "security" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
        >
          <ShieldAlert className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" />
          Segurança ({rows.filter((r) => r.action.startsWith("security.")).length})
        </button>
      </div>

      {tab === "security" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4 text-primary" />
            Registrar evento de segurança
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Use para documentar mudanças de RLS, rotação de segredos de webhook/cron e revisões de políticas.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[200px_180px_1fr_auto]">
            <Select value={secKind} onValueChange={(v) => setSecKind(v as SecurityKind)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rls_change">Mudança de RLS</SelectItem>
                <SelectItem value="webhook_secret_rotation">Rotação de segredo (webhook)</SelectItem>
                <SelectItem value="cron_secret_rotation">Rotação de segredo (cron)</SelectItem>
                <SelectItem value="policy_review">Revisão de política</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={secEntity}
              onChange={(e) => setSecEntity(e.target.value)}
              placeholder="Entidade (opcional)"
              className="h-9"
            />
            <Input
              value={secSummary}
              onChange={(e) => setSecSummary(e.target.value)}
              placeholder="Descrição curta do evento…"
              className="h-9"
            />
            <Button size="sm" onClick={submitSecurity} disabled={secSaving}>
              {secSaving ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Quando</th>
              <th className="px-4 py-2 font-medium">Ação</th>
              <th className="px-4 py-2 font-medium">Usuário</th>
              <th className="px-4 py-2 font-medium">Entidade</th>
              <th className="px-4 py-2 font-medium">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum evento encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/60 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant="secondary"
                      className={ACTION_TONE[r.action] ?? "bg-muted text-muted-foreground"}
                    >
                      {ACTION_LABEL[r.action] ?? r.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.actor_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.actor_role ?? ""}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.entity ?? "—"}
                    {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <pre className="max-w-md overflow-x-auto rounded bg-muted/40 px-2 py-1 text-[11px] leading-tight text-muted-foreground">
                      {Object.keys(r.details ?? {}).length
                        ? JSON.stringify(r.details, null, 0)
                        : "—"}
                    </pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
