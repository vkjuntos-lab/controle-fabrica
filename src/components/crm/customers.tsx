import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actCrm, saveCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { commercialStatusLabel } from "@/lib/crm/constants";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { asNumber, asRecord, useCrmDetail, useCrmQuery } from "./data";
import { CrmListPage } from "./list";
import { ResultState, Shell, StatusBadge, money, str } from "./shared";

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
      {(org) => <Customer360 org={org} companyId={id} />}
    </Shell>
  );
}

function Customer360({ org, companyId }: { org: string; companyId: string }) {
  const { hasPermission } = useOrganization();
  const company = useCrmQuery(org, "companies", { id: companyId });
  const profile = useCrmQuery(org, "customers", { company_id: companyId });
  const contacts = useCrmQuery(org, "contacts", { company_id: companyId });
  const opportunities = useCrmQuery(org, "opportunities", { company_id: companyId });
  const quotes = useCrmQuery(org, "quotes", { company_id: companyId });
  const activities = useCrmQuery(org, "activities", { company_id: companyId });
  const history = useCrmQuery(org, "leads", { company_id: companyId });
  const portfolios = useCrmQuery(org, "portfolios", { company_id: companyId });
  const finance = useCrmDetail(org, "finance", { company_id: companyId }, hasPermission("commercial_sensitive.read"));

  const companyRow = (company.data?.rows ?? [])[0] as CrmRow | undefined;
  const profileRow = (profile.data?.rows ?? [])[0] as CrmRow | undefined;
  const loading = company.isLoading || profile.isLoading;
  const error = company.error ?? profile.error;
  const mergedRequests = useMergeRequest(org, companyId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">
          {str(companyRow?.legal_name ?? companyRow?.trade_name ?? "Cliente")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            value={profileRow?.commercial_status ?? companyRow?.status}
            kind="status"
          />
          {hasPermission("customers.merge") ? (
            <Button variant="outline" onClick={() => mergedRequests.setOpen(true)}>
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
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <ResultState
            loading={loading}
            error={error}
            empty={!companyRow && !profileRow}
          >
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
                    <Row
                      label="Condição de pagamento"
                      value={str(profileRow?.payment_terms_id)}
                    />
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
                  <p className="mt-3 text-xs text-muted-foreground">
                    Transferir carteira não reescreve o responsável de negociações antigas.
                  </p>
                </CardContent>
              </Card>
            </div>
          </ResultState>
        </TabsContent>

        <TabsContent value="contacts">
          <RowList
            rows={contacts.data?.rows as CrmRow[] | undefined}
            loading={contacts.isLoading}
            error={contacts.error}
            empty="Nenhum contato cadastrado nesta empresa."
            render={(row) => (
              <>
                <strong>{str(row.name)}</strong>
                <span className="text-sm text-muted-foreground">
                  {str(row.position ?? row.job_title)} · {str(row.email)} · {str(row.phone)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Canal preferido: {str(row.preferred_channel ?? "não informado")}
                  {row.marketing_opt_in ? " · aceita comunicação comercial" : " · sem consentimento de marketing"}
                </span>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="opportunities">
          <RowList
            rows={opportunities.data?.rows as CrmRow[] | undefined}
            loading={opportunities.isLoading}
            error={opportunities.error}
            empty="Nenhuma oportunidade registrada."
            render={(row) => (
              <>
                <strong>{str(row.title)}</strong>
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
            loading={quotes.isLoading}
            error={quotes.error}
            empty="Nenhuma proposta emitida."
            render={(row) => (
              <>
                <strong>
                  Proposta {str(row.quote_number)} · v{str(row.version)}
                </strong>
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
            empty="Nenhum lead convertido para esta empresa."
            render={(row) => (
              <>
                <strong>{str(row.name)}</strong>
                <span className="text-sm text-muted-foreground">
                  Convertido em {str(row.converted_at ?? row.created_at)}
                </span>
                <StatusBadge value={row.status} kind="status" />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="finance">
          {hasPermission("commercial_sensitive.read") ? (
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
          <p className="text-sm text-muted-foreground">
            O armazenamento privado de documentos comerciais (propostas, contratos, briefings,
            autorizações) não está implementado neste Master. Nenhum botão de anexo é exibido para
            não sugerir uma capacidade inexistente.
          </p>
        </TabsContent>
      </Tabs>

      {mergedRequests.open ? (
        <MergeDialog org={org} companyId={companyId} onClose={mergedRequests.close} />
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
}: {
  rows?: CrmRow[];
  loading: boolean;
  error: Error | null;
  empty: string;
  render: (row: CrmRow) => React.ReactNode;
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
 * Mesclagem é um pedido de revisão, não uma junção automática: o servidor cria o
 * registro com status fixo de revisão e não move nenhum dado sem uma decisão
 * posterior registrada.
 */
function useMergeRequest(org: string, companyId: string) {
  const [open, setOpen] = useState(false);
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
          values: {
            source_company_id: companyId,
            target_company_id: target,
            reason,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Solicitação de mesclagem registrada para revisão.");
      setOpen(false);
      void client.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { open, setOpen, close: () => setOpen(false), target, setTarget, reason, setReason, send };
}

function MergeDialog({
  org,
  companyId,
  onClose,
}: {
  org: string;
  companyId: string;
  onClose: () => void;
}) {
  const request = useMergeRequest(org, companyId);
  return (
    <MergeDialogForm
      title="Solicitar mesclagem de empresa"
      description="Registra a solicitação com origem, destino e motivo. Nada é movido automaticamente: a mesclagem preserva histórico e auditoria e depende de uma decisão posterior."
      target={request.target}
      setTarget={request.setTarget}
      reason={request.reason}
      setReason={request.setReason}
      pending={request.send.isPending}
      onSubmit={() => request.send.mutate()}
      onClose={onClose}
    />
  );
}

function MergeDialogForm({
  title,
  description,
  target,
  setTarget,
  reason,
  setReason,
  pending,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  target: string;
  setTarget: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <RequestDialog
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <Button disabled={pending || !target || !reason.trim()} onClick={onSubmit}>
          {pending ? "Registrando..." : "Registrar solicitação"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CompanyPicker org={orgFor(target)} value={target} onChange={setTarget} />
        <div className="space-y-1">
          <label className="text-sm" htmlFor="merge-reason">
            Motivo
          </label>
          <input
            id="merge-reason"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
    </RequestDialog>
  );
}

const orgFor = (_value: string) => "";

/** Diálogo genérico com cabeçalho, corpo e rodapé. */
export function RequestDialog({
  title,
  description,
  children,
  onClose,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompanyPicker({
  org,
  value,
  onChange,
}: {
  org: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { currentOrganization } = useOrganization();
  const active = org || currentOrganization?.organization_id || "";
  const query = useCrmQuery(active, "companies", {}, 1);
  return (
    <div className="space-y-1">
      <label className="text-sm" htmlFor="merge-target">
        Empresa que permanece
      </label>
      <select
        id="merge-target"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {((query.data?.rows ?? []) as CrmRow[]).map((row) => (
          <option key={row.id} value={row.id}>
            {str(row.legal_name ?? row.trade_name ?? row.id)}
          </option>
        ))}
      </select>
    </div>
  );
}

export { Badge, asNumber, actCrm };
