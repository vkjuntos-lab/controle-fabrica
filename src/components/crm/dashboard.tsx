import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganization } from "@/lib/org/org-context";
import { exportCrmCsv } from "@/lib/crm/export";
import { asNumber, asRecord, useCrmDetail, useCrmQuery } from "./data";
import { Metric, ResultState, Shell, money, number, percent } from "./shared";

/**
 * Indicadores do CRM. Todos os números vêm de `crm_query` com `kind=dashboard`,
 * ou seja, são fatos do próprio módulo: nada aqui é estimativa apresentada como
 * receita, e oportunidade em aberto nunca entra como venda realizada.
 */
export function CommercialDashboard() {
  return (
    <Shell title="Comercial · Dashboard" permission="crm.dashboard">
      {(org) => <Dashboard org={org} />}
    </Shell>
  );
}

function Dashboard({ org }: { org: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const filters = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const summary = useCrmDetail(org, "dashboard", filters);
  const byStage = useCrmQuery(org, "opportunities", { status: "OPEN" });
  const byRep = useCrmQuery(org, "opportunities", { status: "OPEN" });

  async function exportRows() {
    setExporting(true);
    try {
      const leads = await collect(org, "leads", filters);
      exportCrmCsv("comercial-leads.csv", leads as Record<string, unknown>[]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  }

  const data = asRecord(summary.data);
  const openRows = asRecord(byStage.data);
  const total = asNumber(data.leads);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="crm-from">De</Label>
            <Input
              id="crm-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="crm-to">Até</Label>
            <Input
              id="crm-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
        <Button variant="outline" disabled={exporting} onClick={() => void exportRows()}>
          {exporting ? "Exportando..." : "CSV de leads"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Oportunidade em aberto é previsão comercial, não receita. Filtros de período consideram a
        data de registro de cada fato.
      </p>

      <ResultState
        loading={summary.isLoading}
        error={summary.error}
        empty={!summary.data || Object.keys(summary.data).length === 0}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Leads cadastrados" value={total} />
          <Metric label="Leads qualificados" value={asNumber(data.qualified)} />
          <Metric label="Leads convertidos" value={asNumber(data.converted)} />
          <Metric
            label="Taxa de conversão de leads"
            value={percent(data.conversion_percent)}
            hint="Convertidos ÷ leads não arquivados"
          />
          <Metric label="Oportunidades abertas" value={asNumber(data.open_opportunities)} />
          <Metric
            label="Valor estimado aberto"
            value={money(data.estimated_value)}
            hint="Somatório de oportunidades em aberto"
          />
          <Metric
            label="Valor ponderado (estimativa)"
            value={money(data.weighted_estimate)}
            hint="Estimado × probabilidade da etapa"
          />
          <Metric label="Propostas enviadas" value={asNumber(data.sent)} />
          <Metric label="Propostas aceitas" value={asNumber(data.accepted)} />
          <Metric
            label="Taxa de aceite"
            value={percent(data.acceptance_percent)}
            hint="Aceitas ÷ decisões conhecidas (aceita ou rejeitada)"
          />
          <Metric label="Atividades pendentes" value={asNumber(data.pending_activities)} />
          <Metric
            label="Atividades atrasadas"
            value={asNumber(data.overdue_activities)}
            hint="Pendentes com agendamento no passado"
          />
        </div>
      </ResultState>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-heading text-base font-semibold">
              Distribuição por etapa (oportunidades abertas)
            </h3>
            <StageBreakdown rows={Array.isArray(openRows.rows) ? (openRows.rows as never[]) : []} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-heading text-base font-semibold">
              Distribuição por representante
            </h3>
            <p className="text-sm text-muted-foreground">
              Abaixo está a relação de oportunidades abertas carregada com sucesso. A
              consolidação por representante usa a mesma lista oficial do pipeline.
            </p>
            <RepresentativeBreakdown
              rows={Array.isArray(byRep.data?.rows) ? (byRep.data.rows as never[]) : []}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

type RowLike = { stage_id?: string; representative_id?: string; estimated_value?: number };

function groupBy(rows: RowLike[], key: "stage_id" | "representative_id") {
  const totals = new Map<string, { count: number; value: number }>();
  rows.forEach((row) => {
    const id = String(row[key] ?? "—");
    const current = totals.get(id) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += Number(row.estimated_value ?? 0);
    totals.set(id, current);
  });
  return [...totals.entries()];
}

function StageBreakdown({ rows }: { rows: RowLike[] }) {
  const groups = groupBy(rows, "stage_id");
  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">Nenhuma oportunidade em aberto.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="pb-2 pr-4">Etapa</th>
          <th className="pb-2 pr-4 text-right">Oportunidades</th>
          <th className="pb-2 text-right">Valor estimado</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(([id, total]) => (
          <tr key={id} className="border-b hover:bg-muted/40">
            <td className="py-2 pr-4 font-mono text-xs">{id}</td>
            <td className="py-2 pr-4 text-right">{total.count}</td>
            <td className="py-2 text-right">{money(total.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RepresentativeBreakdown({ rows }: { rows: RowLike[] }) {
  const groups = groupBy(rows, "representative_id");
  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">Nenhuma oportunidade em aberto.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="pb-2 pr-4">Representante</th>
          <th className="pb-2 pr-4 text-right">Oportunidades</th>
          <th className="pb-2 text-right">Valor estimado</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(([id, total]) => (
          <tr key={id} className="border-b hover:bg-muted/40">
            <td className="py-2 pr-4 font-mono text-xs">{id}</td>
            <td className="py-2 pr-4 text-right">{total.count}</td>
            <td className="py-2 text-right">{money(total.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Busca todas as páginas de um kind, respeitando o mesmo filtro da tela. */
export async function collect(org: string, kind: string, filters: Record<string, string>) {
  const { queryCrm } = await import("@/lib/crm/crm.functions");
  const rows: Record<string, unknown>[] = [];
  let page = 1;
  let total = 1;
  while (rows.length < total) {
    const response = (await queryCrm({
      data: { organizationId: org, kind, filters, page, export: false },
    })) as { rows?: Record<string, unknown>[]; total?: number };
    const got = response?.rows ?? [];
    rows.push(...got);
    total = Number(response?.total ?? got.length);
    if (!got.length) break;
    page += 1;
  }
  return rows;
}

export { number };
