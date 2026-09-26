import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { exportCrmCsv } from "@/lib/crm/export";
import { asNumber, asRecord, useCrmDetail, useCrmQuery } from "./data";
import { Metric, ResultState, Shell, money, percent } from "./shared";

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
  const api = useServerFn(queryCrm);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const filters = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const summary = useCrmDetail(org, "dashboard", filters);
  const open = useCrmQuery(org, "opportunities", { status: "OPEN" });

  const data = asRecord(summary.data);
  const openRows = (open.data?.rows ?? []) as CrmRow[];

  async function exportRows() {
    setExporting(true);
    try {
      const rows: CrmRow[] = [];
      let page = 1;
      let total = 1;
      while (rows.length < total) {
        const response = await api({
          data: { organizationId: org, kind: "leads", filters, page, export: true },
        });
        const got = (response?.rows ?? []) as CrmRow[];
        rows.push(...got);
        total = Number(response?.total ?? got.length);
        if (!got.length) break;
        page += 1;
      }
      exportCrmCsv("comercial-leads.csv", rows as Record<string, unknown>[]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  }

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
        Oportunidade em aberto é previsão comercial, não receita. O filtro de período considera a
        data de registro de cada fato.
      </p>

      <ResultState
        loading={summary.isLoading}
        error={summary.error}
        empty={!summary.data || Object.keys(summary.data).length === 0}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Leads cadastrados" value={asNumber(data.leads)} />
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
            hint="Somatório das oportunidades em aberto"
          />
          <Metric
            label="Valor ponderado (estimativa)"
            value={money(data.weighted_estimate)}
            hint="Valor estimado × probabilidade da etapa"
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
              Oportunidades abertas por etapa
            </h3>
            <Breakdown rows={openRows} groupBy="stage_id" empty="Nenhuma oportunidade em aberto." />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-heading text-base font-semibold">
              Oportunidades abertas por representante
            </h3>
            <Breakdown
              rows={openRows}
              groupBy="representative_id"
              empty="Nenhuma oportunidade em aberto."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Breakdown({
  rows,
  groupBy,
  empty,
}: {
  rows: CrmRow[];
  groupBy: "stage_id" | "representative_id";
  empty: string;
}) {
  const totals = new Map<string, { count: number; value: number }>();
  rows.forEach((row) => {
    const id = String(row[groupBy] ?? "—");
    const current = totals.get(id) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += Number(row.estimated_value ?? 0);
    totals.set(id, current);
  });
  if (!totals.size) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">{groupBy === "stage_id" ? "Etapa" : "Representante"}</th>
            <th className="pb-2 pr-4 text-right">Oportunidades</th>
            <th className="pb-2 text-right">Valor estimado</th>
          </tr>
        </thead>
        <tbody>
          {[...totals.entries()].map(([id, total]) => (
            <tr key={id} className="border-b hover:bg-muted/40">
              <td className="py-2 pr-4 font-mono text-xs">{id}</td>
              <td className="py-2 pr-4 text-right">{total.count}</td>
              <td className="py-2 text-right">{money(total.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
