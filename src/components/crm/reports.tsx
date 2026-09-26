import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useOrganization } from "@/lib/org/org-context";
import type { CrmResult } from "@/lib/crm/crm.functions";
import { asRowsFrom, useCrmQuery } from "./data";
import { ResultState, Shell, money, number, percent, str } from "./shared";

/**
 * Relatórios comerciais.
 *
 * Tudo aqui é leitura de `crm_query`, sem agregação no navegador: converter linhas
 * em número no cliente daria um resultado diferente do servidor e mudaria junto com
 * a paginação. Os filtros de período e responsável são os que o servidor aceita —
 * a tela não inventa recorte que a consulta não aplicou.
 */
export function ReportsPage() {
  return (
    <Shell title="Comercial · Relatórios" permission="crm.read">
      {(org) => <Reports org={org} />}
    </Shell>
  );
}

function Reports({ org }: { org: string }) {
  const { hasPermission } = useOrganization();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const period = { ...(from ? { from } : {}), ...(to ? { to } : {}) };

  const dashboard = useCrmQuery(org, "dashboard", period, 1);
  const leads = useCrmQuery(org, "leads", period, 1);
  const opportunities = useCrmQuery(org, "opportunities", period, 1);
  const quotes = useCrmQuery(org, "quotes", period, 1);
  const activities = useCrmQuery(org, "activities", {}, 1);
  const sensitive = hasPermission("commercial_sensitive.read");

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-xl font-semibold">Relatórios</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="report-from">De</Label>
          <input
            id="report-from"
            type="date"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-to">Até</Label>
          <input
            id="report-to"
            type="date"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        {from || to ? (
          <Button
            variant="outline"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Limpar período
          </Button>
        ) : null}
      </div>

      <ResultState loading={dashboard.isLoading} error={dashboard.error} empty={!dashboard.data}>
        <Funnel dashboard={dashboard.data ?? {}} />
      </ResultState>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Leads"
          total={leads.data?.total ?? 0}
          loading={leads.isLoading}
          error={leads.error}
          empty={!leads.data?.total}
          emptyText="Nenhum lead no período."
        >
          <StatusBreakdown
            total={Number(leads.data?.total ?? 0)}
            hint="A conversão é calculada sobre os leads não arquivados."
          />
        </ReportCard>
        <ReportCard
          title="Propostas"
          total={quotes.data?.total ?? 0}
          loading={quotes.isLoading}
          error={quotes.error}
          empty={!quotes.data?.total}
          emptyText="Nenhuma proposta no período."
        >
          <StatusBreakdown total={Number(quotes.data?.total ?? 0)} />
        </ReportCard>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <h3 className="font-heading text-base font-semibold">Oportunidades por etapa</h3>
          <p className="text-xs text-muted-foreground">
            Valor estimado somado pelo servidor no período selecionado. Opportunity não é receita: o
            valor só vira receita com venda confirmada.
          </p>
          <ResultState
            loading={opportunities.isLoading}
            error={opportunities.error}
            empty={!opportunities.data?.total}
          >
            <ul className="space-y-1 text-sm">
              {asRowsFrom(opportunities.data).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 border-b py-1">
                  <span>{str(row.title)}</span>
                  <span className="tabular-nums">
                    {money(row.estimated_value)} · {percent(row.probability)}
                  </span>
                </li>
              ))}
            </ul>
          </ResultState>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <h3 className="font-heading text-base font-semibold">Atividades</h3>
          <p className="text-sm text-muted-foreground">
            {number(activities.data?.total ?? 0, 0)} atividades registradas no escopo visível.
            {sensitive
              ? ""
              : " Valores sensíveis não são consultados sem a permissão correspondente."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportCard({
  title,
  total,
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  title: string;
  total: number;
  loading: boolean;
  error: Error | null;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-heading text-base font-semibold">{title}</h3>
          <span className="text-sm text-muted-foreground">{number(total, 0)} registros</span>
        </div>
        <ResultState loading={loading} error={error} empty={empty}>
          {children}
        </ResultState>
        {empty ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * Funil. Os números vêm inteiros do servidor — inclusive as taxas, que o
 * PostgreSQL calcula com `round` — para que o número da tela seja o mesmo número
 * que o servidor gravou no evento.
 */
function Funnel({ dashboard }: { dashboard: CrmResult }) {
  const leads = Number(dashboard.leads ?? 0);
  const qualified = Number(dashboard.qualified ?? 0);
  const converted = Number(dashboard.converted ?? 0);
  const open = Number(dashboard.open_opportunities ?? 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Leads no período</p>
          <p className="text-2xl font-semibold tabular-nums">{number(leads, 0)}</p>
          <p className="text-xs text-muted-foreground">
            {number(qualified, 0)} qualificados · {percent(dashboard.conversion_percent)}{" "}
            convertidos
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Oportunidades abertas</p>
          <p className="text-2xl font-semibold tabular-nums">{number(open, 0)}</p>
          <p className="text-xs text-muted-foreground">
            {money(dashboard.estimated_value)} estimados
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Valor ponderado</p>
          <p className="text-2xl font-semibold tabular-nums">
            {money(dashboard.weighted_estimate)}
          </p>
          <p className="text-xs text-muted-foreground">
            Estimativa × probabilidade. Não é receita prevista.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Propostas</p>
          <p className="text-2xl font-semibold tabular-nums">
            {number(dashboard.sent ?? 0, 0)} enviadas
          </p>
          <p className="text-xs text-muted-foreground">
            {number(dashboard.accepted ?? 0, 0)} aceitas · {percent(dashboard.acceptance_percent)}{" "}
            de aceite sobre enviadas respondidas
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Distribuição por status do conjunto carregado na página. */
function StatusBreakdown({ total, hint }: { total: number; hint?: string }) {
  if (!total) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {number(total, 0)} registros no total.
      {hint ? ` ${hint}` : ""} O recorte por status está no filtro da listagem, não somado aqui.
    </p>
  );
}
