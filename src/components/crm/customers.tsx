import { CustomerOrders } from "@/components/sales/workspace";
import {
  CompanyChoice,
  companyChoicePayload,
  companyChoiceReady,
  type CompanyChoiceValue,
} from "./company-choice";
import { CustomerDocuments } from "./documents";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { commercialStatusLabel } from "@/lib/crm/constants";
import { useOrganization } from "@/lib/org/org-context";
import { areas, type Area } from "./config";
import { asRecord, useCrmDetail, useCrmQuery } from "./data";
import { CrmListPage, RecordDialog } from "./list";
import { Pager, Picker, ResultState, Shell, StatusBadge, money, selectClass, str } from "./shared";

const area = areas.clientes;

/**
 * Lista de clientes.
 *
 * A empresa é a mesma do ERP: um fornecedor que vira cliente ganha o papel
 * CUSTOMER na mesma `companies`, sem cadastro duplicado. Por isso a linha
 * aprovada abre o Customer 360, não um novo formulário.
 */
export function CustomersPage() {
  return (
    <CrmListPage
      area={area}
      title="Comercial · Clientes"
      intro="Cadastro comercial sobre a empresa única do ERP. Um fornecedor ou parceiro que passa a comprar recebe o papel correspondente, nunca uma segunda empresa."
      extraActions={<NewCompanyCustomer />}
      rowHref={(row) => `/comercial/clientes/${String(row.company_id ?? row.id)}`}
    />
  );
}

/**
 * Customer 360.
 *
 * Não duplica o Partner 360: é a mesma empresa com outra perspectiva, e as abas
 * carregam apenas fatos das permissões do usuário. Dados financeiros, margem e
 * comissão ficam atrás de `commercial_sensitive.read` e não são carregados sem
 * ela — a tela não esconde nada que o usuário não possa ler.
 */
export function Customer360Page({ id }: { id: string }) {
  return (
    <Shell title="Comercial · Cliente" permission="customers.read">
      {(org) => <Customer360 key={id} org={org} companyId={id} />}
    </Shell>
  );
}

function Customer360({ org, companyId }: { org: string; companyId: string }) {
  const { hasPermission } = useOrganization();
  const [merging, setMerging] = useState(false);
  const [classifying, setClassifying] = useState<"tag" | "territory" | null>(null);
  const [editingContact, setEditingContact] = useState<CrmRow | null | undefined>();
  const [historyPage, setHistoryPage] = useState(1);
  const [pages, setPages] = useState({
    contacts: 1,
    opportunities: 1,
    quotes: 1,
    activities: 1,
    portfolios: 1,
  });
  const client = useQueryClient();
  const company = useCrmQuery(org, "companies", { id: companyId });
  const profile = useCrmQuery(org, "customers", { company_id: companyId });
  const contacts = useCrmQuery(org, "contacts", { company_id: companyId }, pages.contacts);
  const opportunities = useCrmQuery(
    org,
    "opportunities",
    { company_id: companyId },
    pages.opportunities,
  );
  const quotes = useCrmQuery(org, "quotes", { company_id: companyId }, pages.quotes);
  const activities = useCrmQuery(org, "activities", { company_id: companyId }, pages.activities);
  const history = useCrmQuery(org, "timeline", { company_id: companyId }, historyPage);
  const portfolios = useCrmQuery(org, "portfolios", { company_id: companyId }, pages.portfolios);
  // A posição financeira só é consultada com a permissão: pedi-la sem permissão
  // só produziria um erro do servidor para algo que o usuário não pode ver.
  const finance = useCrmDetail(
    org,
    "finance",
    { company_id: companyId },
    hasPermission("commercial_sensitive.read") && hasPermission("receivables.read"),
  );

  const companyRow = (company.data?.rows ?? [])[0] as CrmRow | undefined;
  const profileRow = (profile.data?.rows ?? [])[0] as CrmRow | undefined;
  const loading = company.isLoading || profile.isLoading;
  const error = company.error ?? profile.error;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">
          {str(companyRow?.legal_name ?? companyRow?.trade_name ?? "Cliente")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={profileRow?.commercial_status ?? companyRow?.status} kind="status" />
          {hasPermission("customers.update") && (
            <>
              <Button variant="outline" onClick={() => setClassifying("tag")}>
                Vincular etiqueta
              </Button>
              <Button variant="outline" onClick={() => setClassifying("territory")}>
                Vincular território
              </Button>
            </>
          )}
          {hasPermission("customers.merge") ? (
            <Button variant="outline" onClick={() => setMerging(true)}>
              Solicitar mesclagem
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {str(companyRow?.document_number)} · {str(companyRow?.email)} · {str(companyRow?.phone)}
      </p>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          {[
            ["overview", "Visão geral"],
            ["contacts", "Contatos"],
            ["opportunities", "Oportunidades"],
            ["quotes", "Propostas"],
            ["activities", "Atividades"],
            ["history", "Histórico comercial"],
            ["finance", "Financeiro"],
            ["documents", "Documentos"],
            ...(hasPermission("sales_orders.read") ? [["orders", "Pedidos"]] : []),
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {hasPermission("sales_orders.read") && <TabsContent value="orders"><CustomerOrders org={org} companyId={companyId}/></TabsContent>}
        <TabsContent value="overview">
          <ResultState loading={loading} error={error} empty={!companyRow && !profileRow}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="pt-6">
                  <h3 className="mb-3 font-heading text-base font-semibold">Dados comerciais</h3>
                  <dl className="grid gap-2 text-sm">
                    <Row label="Código comercial" value={str(profileRow?.customer_code)} />
                    <Row label="Tipo" value={str(profileRow?.customer_type)} />
                    <Row
                      label="Status comercial"
                      value={commercialStatusLabel(str(profileRow?.commercial_status))}
                    />
                    <Row label="Segmento" value={str(profileRow?.commercial_segment_id)} />
                    <Row label="Origem" value={str(profileRow?.acquisition_source_id)} />
                    <Row label="Tabela de preços" value={str(profileRow?.price_table_id)} />
                    <Row label="Condição de pagamento" value={str(profileRow?.payment_terms_id)} />
                    <Row label="Observações" value={str(profileRow?.notes)} />
                  </dl>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h3 className="mb-3 font-heading text-base font-semibold">Carteira</h3>
                  <ul className="space-y-2 text-sm">
                    {((portfolios.data?.rows ?? []) as CrmRow[]).map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs">{str(item.representative_id)}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.ended_at
                            ? `encerrado em ${str(item.ended_at)}`
                            : `ativo desde ${str(item.started_at)}`}
                        </span>
                      </li>
                    ))}

                    {!(portfolios.data?.rows ?? []).length ? (
                      <li className="text-muted-foreground">Sem atribuição de carteira.</li>
                    ) : null}
                  </ul>
                  <Pager
                    page={pages.portfolios}
                    total={portfolios.data?.total || 0}
                    setPage={(page) => setPages({ ...pages, portfolios: page })}
                  />
                  <p className="mt-3 text-xs text-muted-foreground">
                    Transferir carteira não reescreve o responsável de negociações antigas.
                  </p>
                </CardContent>
              </Card>
            </div>
          </ResultState>
        </TabsContent>

        <TabsContent value="contacts">
          {hasPermission("customers.update") && (
            <Button onClick={() => setEditingContact(null)}>Novo contato</Button>
          )}
          <RowList
            rows={contacts.data?.rows as CrmRow[] | undefined}
            page={pages.contacts}
            total={contacts.data?.total || 0}
            onPage={(page) => setPages({ ...pages, contacts: page })}
            loading={contacts.isLoading}
            error={contacts.error}
            empty="Nenhum contato cadastrado nesta empresa."
            render={(row) => (
              <>
                <strong>{str(row.name)}</strong>
                {hasPermission("customers.update") && (
                  <Button variant="outline" onClick={() => setEditingContact(row)}>
                    Editar contato
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">
                  {str(row.position ?? row.job_title)} · {str(row.email)} · {str(row.phone)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Canal preferido: {str(row.preferred_channel ?? "não informado")}
                  {row.marketing_opt_in
                    ? " · aceita comunicação comercial"
                    : " · sem consentimento de marketing"}
                </span>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="opportunities">
          <RowList
            rows={opportunities.data?.rows as CrmRow[] | undefined}
            page={pages.opportunities}
            total={opportunities.data?.total || 0}
            onPage={(page) => setPages({ ...pages, opportunities: page })}
            loading={opportunities.isLoading}
            error={opportunities.error}
            empty="Nenhuma oportunidade registrada."
            render={(row) => (
              <>
                <a className="font-semibold underline" href={`/comercial/oportunidades/${row.id}`}>
                  {str(row.title)}
                </a>
                <span className="text-sm text-muted-foreground">
                  {str(row.estimated_value)} · probabilidade {str(row.probability)}% · fecha{" "}
                  {str(row.expected_close_date)}
                </span>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="quotes">
          <RowList
            rows={quotes.data?.rows as CrmRow[] | undefined}
            page={pages.quotes}
            total={quotes.data?.total || 0}
            onPage={(page) => setPages({ ...pages, quotes: page })}
            loading={quotes.isLoading}
            error={quotes.error}
            empty="Nenhuma proposta emitida."
            render={(row) => (
              <>
                <a className="font-semibold underline" href={`/comercial/propostas/${row.id}`}>
                  Proposta {str(row.quote_number)} · v{str(row.version)}
                </a>
                <span className="text-sm text-muted-foreground">
                  {money(row.total)} · válida até {str(row.valid_until)}
                </span>
                <StatusBadge value={row.status} kind="status" />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="activities">
          <RowList
            rows={activities.data?.rows as CrmRow[] | undefined}
            page={pages.activities}
            total={activities.data?.total || 0}
            onPage={(page) => setPages({ ...pages, activities: page })}
            loading={activities.isLoading}
            error={activities.error}
            empty="Nenhuma atividade registrada."
            render={(row) => (
              <>
                <strong>{str(row.subject)}</strong>
                <span className="text-sm text-muted-foreground">
                  {str(row.activity_type)} · {str(row.scheduled_at)}
                </span>
                <StatusBadge value={row.status} kind="status" />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="history">
          <RowList
            rows={history.data?.rows as CrmRow[] | undefined}
            loading={history.isLoading}
            error={history.error}
            empty="Nenhum fato comercial registrado."
            render={(row) => (
              <>
                <a className="font-semibold underline" href={str(row.href)}>
                  {str(row.title)}
                </a>
                <span className="text-sm text-muted-foreground">
                  {str(row.kind)} · {str(row.created_at)}
                </span>
              </>
            )}
          />
          {(history.data?.total || 0) > 50 && (
            <div className="flex gap-3">
              <Button disabled={historyPage === 1} onClick={() => setHistoryPage(historyPage - 1)}>
                Anterior
              </Button>
              <Button
                disabled={historyPage * 50 >= (history.data?.total || 0)}
                onClick={() => setHistoryPage(historyPage + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="finance">
          {hasPermission("commercial_sensitive.read") && hasPermission("receivables.read") ? (
            <ResultState
              loading={finance.isLoading}
              error={finance.error}
              empty={!finance.data || Object.keys(finance.data).length === 0}
            >
              <FinancePanel data={asRecord(finance.data)} />
            </ResultState>
          ) : (
            <p className="text-sm text-muted-foreground">
              Dados financeiros exigem a permissão comercial sensível. Nenhum valor foi consultado.
            </p>
          )}
        </TabsContent>

        <TabsContent value="documents">
          <CustomerDocuments org={org} companyId={companyId} />
        </TabsContent>
      </Tabs>

      {editingContact !== undefined && (
        <RecordDialog
          org={org}
          area={contactArea}
          record={editingContact}
          initialValues={{ company_id: companyId }}
          fields={contactArea.fields.filter((f) => f.key !== "company_id")}
          onClose={() => setEditingContact(undefined)}
          onSaved={() => {
            setEditingContact(undefined);
            void client.invalidateQueries({ queryKey: ["crm", org] });
          }}
        />
      )}
      {classifying && (
        <RecordDialog
          org={org}
          area={classificationArea(classifying)}
          record={null}
          initialValues={{ company_id: companyId }}
          fields={classificationArea(classifying).fields.filter((f) => f.key !== "company_id")}
          onClose={() => setClassifying(null)}
          onSaved={() => {
            setClassifying(null);
            void client.invalidateQueries({ queryKey: ["crm", org] });
          }}
        />
      )}
      {merging ? (
        <MergeDialog org={org} companyId={companyId} onClose={() => setMerging(false)} />
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function RowList({
  rows,
  loading,
  error,
  empty,
  render,
  page = 1,
  total = 0,
  onPage,
}: {
  rows?: CrmRow[];
  page?: number;
  total?: number;
  onPage?: (page: number) => void;
  loading: boolean;
  error: Error | null;
  empty: string;
  render: (row: CrmRow) => ReactNode;
}) {
  return (
    <ResultState loading={loading} error={error} empty={!rows?.length}>
      <div className="space-y-2">
        {rows?.map((row) => (
          <div key={row.id} className="space-y-1 rounded-lg border p-3">
            {render(row)}
          </div>
        ))}
      </div>
      {onPage && <Pager page={page} total={total} setPage={onPage} />}
    </ResultState>
  );
}

/**
 * Posição financeira do cliente. Os valores vêm de `crm_financial_position`, que
 * soma contas a receber reais do MASTER 008 — nunca faturamento, nunca
 * oportunidade, nunca estimativa comercial.
 */
function FinancePanel({ data }: { data: Record<string, unknown> }) {
  const limit = data.credit_limit;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Limite de crédito</p>
          <p className="text-xl font-semibold">
            {limit === null || limit === undefined ? "Não configurado" : money(limit)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Contas a receber em aberto</p>
          <p className="text-xl font-semibold">{money(data.open_amount)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Valores vencidos</p>
          <p className="text-xl font-semibold">{money(data.overdue_amount)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Crédito disponível</p>
          <p className="text-xl font-semibold">
            {data.credit_available === null || data.credit_available === undefined
              ? "Sem limite definido"
              : money(data.credit_available)}
          </p>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
        Política de exposição configurada: {str(data.exposure_policy)}. Bloqueia acima do limite:{" "}
        {data.block_over_limit ? "sim" : "não"}. Bloqueia com valores vencidos:{" "}
        {data.block_overdue ? "sim" : "não"}. A aprovação de proposta consulta esta posição e recusa
        quando a política proíbe — a regra é do servidor, configurável por organização.
      </p>
    </div>
  );
}

/**
 * Mesclagem é um pedido de revisão, não uma junção automática: o servidor grava a
 * solicitação com origem, destino e motivo, e não move nenhum dado sem uma
 * decisão posterior registrada. A tela também não tenta adivinhar a empresa que
 * permanece — o usuário escolhe.
 */
function MergeDialog({
  org,
  companyId,
  onClose,
}: {
  org: string;
  companyId: string;
  onClose: () => void;
}) {
  const api = useServerFn(saveCrm);
  const client = useQueryClient();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      await api({
        data: {
          organizationId: org,
          kind: "merge_request",
          values: { source_company_id: companyId, target_company_id: target, reason },
        },
      });
    },
    onSuccess: () => {
      toast.success("Solicitação de mesclagem registrada para revisão.");
      onClose();
      void client.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Solicitar mesclagem de empresa</DialogTitle>
          <DialogDescription>
            Registra origem, destino e motivo. Nada é movido automaticamente: a mesclagem preserva
            histórico e auditoria e depende de uma decisão posterior.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker
            org={org}
            kind="companies"
            value={target}
            onChange={setTarget}
            label="Empresa que permanece"
          />
          <div className="space-y-1">
            <label className="text-sm" htmlFor="merge-reason">
              Motivo
            </label>
            <input
              id="merge-reason"
              className={selectClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Origem: {companyId}. A empresa de origem continua existindo até a mesclagem ser concluída.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={send.isPending || !target || !reason.trim()}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Registrando..." : "Registrar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const contactArea: Area = {
  title: "Contato",
  query: "contacts",
  save: "contact",
  permission: "customers.read",
  write: "customers.update",
  columns: ["name", "email", "status"],
  fields: [
    { key: "company_id", label: "Empresa" },
    { key: "name", label: "Nome", required: true },
    { key: "title", label: "Cargo" },
    { key: "department", label: "Departamento" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "phone", label: "Telefone" },
    { key: "preferred_channel", label: "Canal preferencial" },
    { key: "processing_purpose", label: "Finalidade do tratamento" },
    { key: "status", label: "Status", type: "options", options: ["ACTIVE", "INACTIVE"] },
    { key: "notes", label: "Observações" },
  ],
};
function NewCompanyCustomer() {
  const { currentOrganization, hasPermission } = useOrganization();
  const api = useServerFn(saveCrm);
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<CompanyChoiceValue>({
    id: "",
    create: false,
    code: "",
    name: "",
    documentType: "",
    documentNumber: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      api({
        data: {
          organizationId: currentOrganization!.organization_id,
          kind: "customer",
          values: companyChoicePayload(choice),
        },
      }),
    onSuccess: () => {
      toast.success("Cliente vinculado ao cadastro unificado.");
      setOpen(false);
      void cache.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!hasPermission("customers.create") || !currentOrganization) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Cadastrar empresa / cliente</Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastro unificado de cliente</DialogTitle>
              <DialogDescription>
                Localize uma empresa existente ou cadastre os dados necessários.
              </DialogDescription>
            </DialogHeader>
            <CompanyChoice
              org={currentOrganization.organization_id}
              value={choice}
              onChange={setChoice}
            />
            <DialogFooter>
              <Button
                disabled={mutation.isPending || !companyChoiceReady(choice)}
                onClick={() => mutation.mutate()}
              >
                Salvar cliente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function classificationArea(kind: "tag" | "territory"): Area {
  return {
    title: kind === "tag" ? "Etiqueta do cliente" : "Território do cliente",
    query: "customers",
    save: kind === "tag" ? "customer_tag" : "customer_territory",
    permission: "customers.read",
    write: "customers.update",
    columns: [],
    fields: [
      { key: "company_id", label: "Empresa" },
      {
        key: kind === "tag" ? "tag_id" : "territory_id",
        label: kind === "tag" ? "Etiqueta" : "Território",
        lookup: kind === "tag" ? "tags" : "territories",
        required: true,
      },
    ],
  };
}
