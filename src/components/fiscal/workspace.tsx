import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/lib/org/org-context";
import {
  readFiscal,
  mutateFiscal,
  importFiscalXml,
  downloadFiscalFile,
  exportFiscal,
} from "@/lib/fiscal/fiscal.functions";
import { forms, sections, lifecycleActions } from "./config";
import { Regression } from "./regression";
import { Preparation, InboundReview, LocationMapping } from "./operations";
import { FiscalForm, Reference, rows, label, type Row } from "./form";
import {
  listings,
  readPermission,
  translate,
  DOCUMENT_STATUS,
  EXCEPTION_STATUS,
  EXCEPTION_TYPE,
  FINDING_TYPE,
  RECONCILIATION_STATUS,
  EVENT_TYPE,
  ORIGIN_CODE,
  type Column,
} from "@/lib/fiscal/constants";
import type { Json } from "@/integrations/supabase/types";
const inputClass = "rounded-md border bg-background px-3 py-2 text-sm";
export function FiscalPage({ view = "dashboard" }: { view?: string }) {
  const { currentOrganization, hasPermission } = useOrganization();
  const org = currentOrganization?.organization_id;
  const section = sections.find((s) => s[0] === view) ?? sections[0];
  return (
    <AppShell title="Fiscal">
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold">Fiscal</h1>
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Preparação e conferência fiscal. Emissão real pendente de provedor configurado e
          homologado. Simulação e XML importado não comprovam autorização oficial.
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Áreas fiscais">
          {sections
            .filter((s) => hasPermission(s[2]))
            .map((s) => (
              <Link
                key={s[0]}
                to="/fiscal"
                search={{ view: s[0] }}
                className={`rounded-md border px-3 py-2 text-sm ${section[0] === s[0] ? "bg-primary text-primary-foreground" : ""}`}
              >
                {s[1]}
              </Link>
            ))}
        </nav>
        {!org ? (
          <p>Selecione uma organização.</p>
        ) : !hasPermission(section[2]) ? (
          <p role="alert">Acesso não permitido.</p>
        ) : (
          <Area key={`${org}:${section[0]}`} org={org} view={section[0]} />
        )}
      </div>
    </AppShell>
  );
}
function Area({ org, view }: { org: string; view: string }) {
  const { hasPermission } = useOrganization();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [establishment, setEstablishment] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const filters: Record<string, Json> = {
    offset,
    ...(establishment ? { establishment_id: establishment } : {}),
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const result = useQuery({
    queryKey: ["fiscal", org, view, filters],
    queryFn: () => readFiscal({ data: { organizationId: org, kind: view, filters } }),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["fiscal", org] });
    setShowForm(false);
  };
  const records = rows(result.data);
  const definition = forms[view];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid text-sm">
          Pesquisar
          <input
            className={inputClass}
            value={search}
            placeholder="Nome, chave, número, série…"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="grid text-sm">
          Status
          <input
            className={inputClass}
            value={status}
            placeholder="Ex.: DRAFT"
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="grid text-sm">
          De
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="grid text-sm">
          Até
          <input
            type="date"
            className={inputClass}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        {["documents", "inbound", "reconciliations", "events", "exceptions"].includes(view) && (
          <div className="min-w-64 text-sm">
            Estabelecimento
            <Reference
              org={org}
              kind="establishments"
              value={establishment}
              onChange={(v) => {
                setEstablishment(v);
                setOffset(0);
              }}
            />
          </div>
        )}
        {definition && hasPermission(definition.permission) && (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Fechar formulário" : "Novo registro"}
          </Button>
        )}
        {hasPermission("fiscal.reports.export") &&
          ["documents", "inbound", "reconciliations"].includes(view) && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const data = await exportFiscal({
                    data: {
                      organizationId: org,
                      kind: view as "documents" | "inbound" | "reconciliations",
                      filters,
                    },
                  });
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `fiscal-${view}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Falha ao exportar");
                }
              }}
            >
              Exportar página
            </Button>
          )}
      </div>
      {showForm &&
        definition &&
        (view === "documents" ? (
          <Preparation org={org} onSaved={refresh} />
        ) : (
          <FiscalForm org={org} definition={definition} onSaved={refresh} />
        ))}
      {view === "inbound" && hasPermission("fiscal.inbound.import") && (
        <ImportForm org={org} onSaved={refresh} />
      )}
      {view === "simulations" && hasPermission("fiscal.simulate") && (
        <Simulation org={org} onSaved={refresh} />
      )}
      {view === "establishments" && hasPermission("fiscal.configure") && (
        <LocationMapping org={org} onSaved={refresh} />
      )}
      {view === "providers" && (
        <p className="rounded-lg border p-5">
          Nenhum provedor operacional. Certificados e credenciais devem ser configurados no
          armazenamento seguro do servidor após a escolha do provedor. Cancelamento, eventos
          oficiais e contingência aguardam integração homologada.
        </p>
      )}
      {(error || result.error) && (
        <p role="alert" className="text-destructive">
          {error || result.error?.message}
        </p>
      )}
      {result.isPending ? (
        <p>Carregando…</p>
      ) : view === "dashboard" ? (
        <Dashboard data={result.data} />
      ) : records.length === 0 ? (
        <p className="rounded-lg border p-8 text-muted-foreground">
          Nenhum registro para os filtros selecionados.
        </p>
      ) : (
        <ListingTable view={view} records={records} onOpen={setSelected} />
      )}
      {view !== "dashboard" && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Anterior
          </Button>
          <span>Página {offset / 50 + 1}</span>
          <Button
            variant="outline"
            disabled={records.length < 50}
            onClick={() => setOffset(offset + 50)}
          >
            Próxima
          </Button>
        </div>
      )}
      {selected && (
        <RecordDetail
          key={String(selected.id)}
          org={org}
          view={view}
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
/** Tabela da área. Cada área declara suas colunas em `listings`; sem
 * declaração, a área não mostra lista genérica com UUID e status cru. */
function ListingTable({
  view,
  records,
  onOpen,
}: {
  view: string;
  records: Row[];
  onOpen: (row: Row) => void;
}) {
  const listing = listings[view];
  if (!listing) {
    return (
      <p className="rounded-lg border p-8 text-muted-foreground">
        Área sem listagem definida. Nada é apresentado como registro.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-muted">
            {listing.columns.map((column) => (
              <th key={column.key} className="p-3 whitespace-nowrap">
                {column.title}
              </th>
            ))}
            <th className="p-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr key={String(row.id)} className="border-t align-top">
              {listing.columns.map((column) => (
                <td key={column.key} className="p-3">
                  {cell(row, column)}
                </td>
              ))}
              <td className="p-3">
                <Button variant="outline" onClick={() => onOpen(row)}>
                  Detalhes e ações
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Valor de uma coluna da listagem, traduzindo código e formatando número. */
function cell(row: Row, column: Column): React.ReactNode {
  const raw = row[column.key];
  if (raw === null || raw === undefined || raw === "") return <>{column.empty ?? "—"}</>;
  if (column.key === "findings") return <Findings value={raw} />;
  if (column.key === "result") return <SimulationResult value={raw} />;
  if (column.key === "has_blocking_issue")
    return raw === true ? "Sim — impede calcular" : "Não";
  if (column.key === "requires_document") return raw === true ? "Sim" : "Não";
  if (typeof raw === "number") return raw.toLocaleString("pt-BR");
  if (typeof raw === "object") return <span className="text-xs">{translate(raw)}</span>;
  const text = translate(raw, column.labels);
  if (column.key === "access_key")
    return <span className="font-mono text-xs break-all">{text}</span>;
  return text;
}

/** Achados da conciliação: nenhum é resolvido por correspondência aritmética. */
function Findings({ value }: { value: Json | undefined }) {
  const items = rows(value);
  if (!items.length) return <>Nenhum achado</>;
  return (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={index} className="text-xs">
          {translate(item.type, FINDING_TYPE)}
          {item.line !== undefined && ` — item ${String(item.line)}`}
        </li>
      ))}
    </ul>
  );
}

/** Resultado da simulação: tributos, regras usadas e pendências. */
function SimulationResult({ value }: { value: Json | undefined }) {
  const data = (value ?? {}) as Row;
  const taxes = rows(data.taxes ?? data.items);
  const warnings = rows(data.warnings);
  return (
    <div className="space-y-1 text-xs">
      <p>
        {translate(data.total_taxes ?? data.total_amount)} ·{" "}
        {translate(data.total_taxes_is_estimated, undefined)}
      </p>
      {taxes.map((tax, index) => (
        <p key={index}>
          {translate(tax.code ?? tax.tax_id)} — {translate(tax.amount ?? tax.rounded_amount)}
        </p>
      ))}
      {warnings.map((warning, index) => (
        <p key={index} className="text-amber-700">
          {typeof warning === "string" ? warning : JSON.stringify(warning)}
        </p>
      ))}
    </div>
  );
}

/**
 * Detalhe do documento fiscal. O painel antigo imprimia o JSON bruto do
 * cabeçalho e nenhum tributo: o snapshot de cálculo, que é a única
 * evidência de QUAL regra gerou QUAL valor, não tinha caminho de leitura
 * na tela. Sem ele, conferir o documento era confiar no total.
 */
function DocumentDetail({ data, fallback }: { data: unknown; fallback: Row }) {
  const d = (data ?? {}) as Row;
  const document = (d.document ?? fallback) as Row;
  const items = rows(d.items);
  const taxes = rows(d.taxes);
  const events = rows(d.events);
  const byItem = new Map<string, Row[]>();
  for (const tax of taxes) {
    const key = String(tax.document_item_id ?? "");
    byItem.set(key, [...(byItem.get(key) ?? []), tax]);
  }
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Detalhe em carregamento. Se persistir, o servidor não devolveu itens nem snapshot.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {[
          ["Número", `${String(document.document_number ?? "—")} / ${String(document.series ?? "—")}`],
          ["Chave de acesso", String(document.access_key ?? "—")],
          ["Estabelecimento", String(document.establishment_id ?? "—")],
          ["Destinatário", String(document.company_id ?? "—")],
          ["Natureza da operação", String(document.operation_nature_id ?? "—")],
          ["Emissão", String(document.issue_date ?? "—")],
          ["Status", translate(document.status, DOCUMENT_STATUS)],
          ["Total", translate(document.total_amount)],
          ["Tributos", translate(document.total_taxes)],
          ["Versão de layout", String(document.layout_version ?? "—")],
        ].map(([title, value]) => (
          <div key={title}>
            <p className="text-muted-foreground">{title}</p>
            <p className="break-all">{value}</p>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-semibold">Itens e tributos apurados</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Documento sem itens.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="p-2">Item</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Valor</th>
                <th>Tributo</th>
                <th>Regra aplicada</th>
                <th>Base</th>
                <th>Valor apurado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const applied = byItem.get(String(item.id)) ?? [];
                return (
                  <tr key={String(item.id)} className="border-t align-top">
                    <td className="p-2">{String(item.line_number ?? "—")}</td>
                    <td>
                      {String(item.description ?? "—")}
                      <div className="text-xs text-muted-foreground">
                        {String(item.sku ?? "")} {String(item.ncm_code ?? "")}
                      </div>
                    </td>
                    <td>{translate(item.quantity)}</td>
                    <td>{translate(item.unit_price)}</td>
                    <td>
                      {applied.length === 0
                        ? "Nenhum snapshot"
                        : applied.map((tax, index) => (
                            <p key={index} className="text-xs">
                              {translate(tax.tax_id)}
                              {tax.treatment_code ? ` · ${String(tax.treatment_code)}` : ""}
                              {tax.is_withheld === true ? " · retenção" : ""}
                              {tax.is_recoverable === true ? " · recuperável" : ""}
                            </p>
                          ))}
                    </td>
                    <td>
                      {applied.length === 0
                        ? "—"
                        : applied.map((tax, index) => (
                            <p key={index} className="text-xs">
                              v{String(tax.tax_rule_version ?? "—")}
                              <div className="text-muted-foreground">
                                {String(tax.base_mode ?? "—")}
                              </div>
                            </p>
                          ))}
                    </td>
                    <td>{applied.map((tax) => translate(tax.base_amount)).join(" / ") || "—"}</td>
                    <td>{applied.map((tax) => translate(tax.rounded_amount)).join(" / ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>Eventos do documento ({events.length})</summary>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {events.map((event) => (
              <li key={String(event.id)}>
                {translate(event.event_type, EVENT_TYPE)} · {String(event.created_at ?? "")}
                <div className="text-muted-foreground">{JSON.stringify(event.payload)}</div>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

/**
 * Trilha de decisão da regra: revisões e regressões. A regra só vira
 * vigente com regressão aprovada, mas a tela não mostrava qual execução
 * justificou a ativação.
 */
function RuleDetail({ data, fallback }: { data: unknown; fallback: Row }) {
  const d = (data ?? {}) as Row;
  const reviews = rows(d.reviews);
  const regressions = rows(d.regressions);
  const items = rows(d.items);
  if (!data) return <p className="text-sm text-muted-foreground">Detalhe em carregamento.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {String(fallback.code ?? "—")} · {translate(fallback.status)} · vigência{" "}
        {String(fallback.valid_from ?? "—")} a {String(fallback.valid_to ?? "vigente")}
      </p>
      <div>
        <h3 className="text-sm font-semibold">Regressões ({regressions.length})</h3>
        {regressions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma regressão registrada. Ativação exige evidência de teste aprovada.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {regressions.map((regression) => (
              <li key={String(regression.id)}>
                regra v{String(regression.rule_version)} ·{" "}
                {regression.passed === true ? "aprovada" : "reprovada"} ·{" "}
                {String(regression.created_at ?? "")}
                <div className="font-mono text-muted-foreground">
                  {String(regression.fingerprint ?? "")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Revisões ({reviews.length})</h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma revisão registrada.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {reviews.map((review) => (
              <li key={String(review.id)}>
                {String(review.from_status)} → {String(review.to_status)} ·{" "}
                {String(review.decision)} · {String(review.created_at ?? "")}
                <div className="text-muted-foreground">{String(review.justification ?? "")}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {items.length > 0 && (
        <details>
          <summary>Tratamentos da versão ({items.length})</summary>
          <ul className="space-y-1 text-xs">
            {items.map((item) => (
              <li key={String(item.id)}>
                {String(item.tax_id)} · {translate(item.rate)} · {String(item.base_mode ?? "—")} ·{" "}
                {String(item.treatment_code ?? "—")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Dashboard({ data }: { data: unknown }) {
  const d = (data ?? {}) as Row;
  const states = (d.documents ?? {}) as Row;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[
        ["Preparados", states.DRAFT ?? 0],
        ["Pendentes", states.PENDING_VALIDATION ?? 0],
        ["Conferidos", states.READY_TO_SEND ?? 0],
        ["Autorizados", states.AUTHORIZED ?? 0],
        ["Rejeitados", states.REJECTED ?? 0],
        ["Cancelamentos pendentes", states.CANCELLATION_REQUESTED ?? 0],
        ["Recebidos", d.inbound ?? 0],
        ["Pendências abertas", d.exceptions ?? 0],
        ["Integração", "Pendente de homologação"],
      ].map(([name, value]) => (
        <div key={String(name)} className="rounded-xl border p-5">
          <p className="text-sm text-muted-foreground">{String(name)}</p>
          <p className="mt-2 text-2xl font-semibold">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}
function RecordDetail({
  org,
  view,
  row,
  onClose,
  onSaved,
}: {
  org: string;
  view: string;
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasPermission } = useOrganization();
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [responsible, setResponsible] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ["fiscal", org, view === "rules" ? "rule_detail" : "detail", row.id],
    queryFn: () =>
      readFiscal({
        data: {
          organizationId: org,
          kind: view === "rules" ? "rule_detail" : "detail",
          filters: { id: row.id ?? null },
        },
      }),
    enabled: view === "documents" || view === "rules",
  });
  async function action(operation: string, values: Record<string, Json>) {
    setBusy(true);
    setError("");
    try {
      const r = await mutateFiscal({
        data: { organizationId: org, operation, id: String(row.id), values: { ...values, reason } },
      });
      if (r && typeof r === "object" && !Array.isArray(r) && r.blocked) {
        setError(String(r.message));
      } else onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(false);
    }
  }
  const lifecycle =
    view === "rules"
      ? "rule_action"
      : view === "natures"
        ? "nature_action"
        : view === "products" || view === "companies"
          ? "profile_action"
          : null;
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex justify-between">
        <h2 className="font-semibold">Detalhes do registro</h2>
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>
      {view === "documents" ? (
        <DocumentDetail data={detail.data} fallback={row} />
      ) : view === "rules" ? (
        <RuleDetail data={detail.data} fallback={row} />
      ) : (
        <details>
          <summary>Dados registrados e evidências</summary>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(row, null, 2)}
          </pre>
        </details>
      )}
      {view === "rules" &&
        ["REVIEW", "APPROVED"].includes(String(row.status)) &&
        hasPermission("fiscal.tax_rules.manage") && (
          <Regression org={org} rule={String(row.id)} onPassed={setEvidence} />
        )}
      <label className="grid gap-1 text-sm">
        Justificativa
        <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {view === "rules" && row.status === "APPROVED" && (
        <label className="grid gap-1 text-sm">
          Referência dos testes de regressão aprovados
          <input
            className={inputClass}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {lifecycle &&
          ["DRAFT", "REVIEW", "APPROVED", "ACTIVE"].includes(String(row.status)) &&
          (() => {
            const a =
              row.status === "DRAFT"
                ? "submit"
                : row.status === "REVIEW"
                  ? "approve"
                  : row.status === "APPROVED"
                    ? "activate"
                    : "retire";
            const perm =
              a === "submit"
                ? view === "natures"
                  ? "fiscal.configure"
                  : "fiscal.tax_rules.manage"
                : "fiscal.tax_rules.approve";
            return (
              hasPermission(perm) && (
                <Button
                  disabled={busy || !reason || (view === "rules" && a === "activate" && !evidence)}
                  onClick={() =>
                    action(lifecycle, {
                      action: a,
                      table:
                        view === "companies"
                          ? "company_fiscal_profiles"
                          : "product_fiscal_profiles",
                      regression_evidence: { passed: true, reference: evidence },
                    })
                  }
                >
                  {
                    {
                      submit: "Enviar para revisão",
                      approve: "Aprovar",
                      activate: "Ativar",
                      retire: "Encerrar",
                    }[a]
                  }
                </Button>
              )
            );
          })()}
        {view === "layouts" && row.status === "DRAFT" && hasPermission("fiscal.configure") && (
          <Button disabled={busy} onClick={() => action("layout", { status: "ACTIVE" })}>
            Ativar leiaute conferido
          </Button>
        )}
        {view === "documents" &&
          hasPermission("fiscal.documents.validate") &&
          ["DRAFT", "PENDING_VALIDATION"].includes(String(row.status)) && (
            <Button
              disabled={busy}
              onClick={() => action("document_action", { action: "validate" })}
            >
              Validar cadastro
            </Button>
          )}
        {view === "documents" &&
          hasPermission("fiscal.documents.validate") &&
          row.status === "VALIDATED" && (
            <Button
              disabled={busy || !reason}
              onClick={() => action("document_action", { action: "approve" })}
            >
              Confirmar conferência
            </Button>
          )}
        {view === "documents" &&
          hasPermission("fiscal.documents.issue") &&
          row.status === "READY_TO_SEND" && (
            <Button disabled title="Provedor não homologado">
              Transmissão indisponível
            </Button>
          )}
        {view === "documents" && hasPermission("fiscal.reconciliation.manage") && (
          <Button disabled={busy} onClick={() => action("reconcile", {})}>
            Conferir vínculos operacionais
          </Button>
        )}
        {view === "exceptions" &&
          hasPermission("fiscal.exceptions.manage") &&
          row.status !== "RESOLVED" && (
            <Button
              disabled={busy || !reason}
              onClick={() => action("exception", { status: "RESOLVED" })}
            >
              Registrar resolução
            </Button>
          )}
        {typeof row.xml_storage_path === "string" && hasPermission("fiscal.documents.download") && (
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const url = await downloadFiscalFile({
                  data: { path: String(row.xml_storage_path) },
                });
                window.open(url, "_blank", "noopener,noreferrer");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Arquivo indisponível");
              }
            }}
          >
            Baixar XML privado
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {view === "inbound" &&
        hasPermission("fiscal.inbound.review") &&
        hasPermission("fiscal.reconciliation.manage") && (
          <InboundReview org={org} row={row} onSaved={onSaved} />
        )}
      {view === "inbound" && hasPermission("fiscal.inbound.review") && (
        <p>
          Autenticidade, assinatura, tributos e frete aguardam conferência. O XML importado não cria
          estoque nem obrigação financeira.
        </p>
      )}
    </section>
  );
}
function ImportForm({ org, onSaved }: { org: string; onSaved: () => void }) {
  const [est, setEst] = useState("");
  const [supplier, setSupplier] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 rounded-xl border p-5 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError("");
        try {
          if (file.size > 2097152) throw new Error("XML deve ter até 2 MB.");
          await importFiscalXml({
            data: {
              organizationId: org,
              establishmentId: est,
              supplierId: supplier,
              xml: await file.text(),
            },
          });
          setFile(null);
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha ao importar");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold md:col-span-2">Importar NF-e recebida (nfeProc 4.00)</h2>
      <label>
        Estabelecimento
        <Reference org={org} kind="establishments" value={est} onChange={setEst} />
      </label>
      <label>
        Fornecedor
        <Reference org={org} kind="supplier_options" value={supplier} onChange={setSupplier} />
      </label>
      <input
        aria-label="Arquivo XML"
        type="file"
        accept=".xml,application/xml,text/xml"
        required
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button disabled={busy || !est || !supplier}>
        {busy ? "Importando…" : "Importar para conferência"}
      </Button>
      <p className="text-sm text-muted-foreground md:col-span-2">
        Validação estrutural preliminar. A autenticidade e a validade oficial permanecem pendentes.
      </p>
      {error && (
        <p role="alert" className="text-destructive md:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}
function Simulation({ org, onSaved }: { org: string; onSaved: () => void }) {
  const [est, setEst] = useState("");
  const [op, setOp] = useState("");
  const [company, setCompany] = useState("");
  const [variant, setVariant] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-xl border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          setResult(
            await mutateFiscal({
              data: {
                organizationId: org,
                operation: "simulate",
                values: {
                  establishment_id: est,
                  operation_type_id: op,
                  company_id: company,
                  document_model: "NFe",
                  ...(date ? { on_date: date } : {}),
                  items: [{ product_variant_id: variant, quantity, unit_price: price }],
                },
              },
            }),
          );
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha ao simular");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">Simulação — não é documento autorizado</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ["Estabelecimento", "establishments", est, setEst],
          ["Operação", "operations", op, setOp],
          ["Contraparte", "company_options", company, setCompany],
          ["Variante", "variant_options", variant, setVariant],
        ].map(([title, kind, value, change]) => (
          <label key={String(kind)}>
            {String(title)}
            <Reference
              org={org}
              kind={String(kind)}
              value={String(value)}
              onChange={change as (v: string) => void}
            />
          </label>
        ))}
        <label>
          Quantidade
          <input
            required
            type="number"
            min="0.000001"
            step="any"
            className={inputClass}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          Preço unitário
          <input
            required
            type="number"
            min="0"
            step="any"
            className={inputClass}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Data da operação
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <Button disabled={busy}>Simular</Button>
      {error && <p role="alert">{error}</p>}
      {result !== null && (
        <pre className="overflow-auto whitespace-pre-wrap rounded border p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </form>
  );
}
