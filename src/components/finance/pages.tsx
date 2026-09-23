import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, EmptyState, ErrorState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/lib/org/org-context";
import { queryPartners } from "@/lib/partners/partners.functions";
import type { CompanyRow, PartnerList } from "@/lib/partners/types";
import {
  createReceivable,
  createPayable,
  queryFinance,
  reverseTransaction,
  generateRecurrences,
} from "@/lib/finance/finance.functions";
import type {
  AgingSummary,
  CashflowSummary,
  CostCenterReport,
  CostCenterRow,
  DashboardSummary,
  FinanceHistoryRow,
  FinanceSettings,
  FinancialAccountRow,
  FinancialCategoryRow,
  PayableDetail,
  PayableList,
  PaymentMethodRow,
  ReceivableDetail,
  ReceivableList,
  RecurrenceRow,
  TransactionList,
} from "@/lib/finance/types";
import {
  activeStatusLabel,
  accountStatusLabel,
  accountTypeLabel,
  categoryTypeLabel,
  documentStatusLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  recurrenceDirectionLabel,
  transactionDirectionLabel,
  transactionTypeLabel,
} from "@/lib/finance/constants";
import { exportFinanceCsv } from "@/lib/finance/export";
import {
  CreatePayableDialog,
  CreateReceivableDialog,
  DirectMovementDialog,
  DocumentActionDialog,
  DocumentOp,
  OpeningBalanceDialog,
  SaveAccountDialog,
  SaveCategoryDialog,
  SaveCostCenterDialog,
  SavePaymentMethodDialog,
  SaveRecurrenceDialog,
  SettleDialog,
  SettingsDialog,
  TransferDialog,
} from "./dialogs";

const cls = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const href = (kind: "receivable" | "payable", id: string) =>
  kind === "receivable" ? `/financeiro/receber/${id}` : `/financeiro/pagar/${id}`;

export function Navigation() {
  return (
    <nav className="flex flex-wrap gap-2 print:hidden">
      {[
        ["/financeiro", "Visão geral"],
        ["/financeiro/receber", "Contas a receber"],
        ["/financeiro/pagar", "Contas a pagar"],
        ["/financeiro/lancamentos", "Lançamentos"],
        ["/financeiro/fluxo", "Fluxo de caixa"],
        ["/financeiro/contas", "Contas"],
        ["/financeiro/relatorios", "Relatórios"],
        ["/financeiro/recorrencias", "Recorrências"],
        ["/financeiro/historico", "Histórico"],
        ["/financeiro/configuracoes", "Configurações"],
      ].map(([to, label]) => (
        <Button key={to} variant="outline" asChild>
          <a href={to}>{label}</a>
        </Button>
      ))}
    </nav>
  );
}

function BadgeStatus({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const css: Record<string, string> = {
    OPEN: "bg-blue-50 text-blue-700 border-blue-200",
    OVERDUE: "bg-red-50 text-red-700 border-red-200",
    PARTIALLY_PAID: "bg-amber-50 text-amber-700 border-amber-200",
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CANCELED: "bg-zinc-100 text-zinc-600 border-zinc-200",
    WRITTEN_OFF: "bg-purple-50 text-purple-700 border-purple-200",
    SCHEDULED: "bg-sky-50 text-sky-700 border-sky-200",
    DRAFT: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return <Badge className={`border ${css[status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>{documentStatusLabel(status)}</Badge>;
}

function useFinanceOptions(org: string | undefined, can: boolean) {
  const fetch = useServerFn(queryFinance);
  const partners = useServerFn(queryPartners);
  const categories = useQuery({
    queryKey: ["finance", "categories", "options", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "categories", filters: {}, page: 1 } })) as FinancialCategoryRow[],
    enabled: Boolean(org && can),
  });
  const costCenters = useQuery({
    queryKey: ["finance", "cost_centers", "options", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "cost_centers", filters: {}, page: 1 } })) as CostCenterRow[],
    enabled: Boolean(org && can),
  });
  const paymentMethods = useQuery({
    queryKey: ["finance", "payment_methods", "options", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "payment_methods", filters: {}, page: 1 } })) as PaymentMethodRow[],
    enabled: Boolean(org && can),
  });
  const accounts = useQuery({
    queryKey: ["finance", "accounts", "options", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "accounts", filters: {}, page: 1 } })) as {
        rows: FinancialAccountRow[];
        total: number;
      },
    enabled: Boolean(org && can),
  });
  const companies = useQuery({
    queryKey: ["partners", "companies", "options", org],
    queryFn: async () => {
      const res = (await partners({
        data: { organizationId: org!, kind: "companies", filters: {}, page: 1 },
      })) as PartnerList;
      return (Array.isArray(res.rows) ? res.rows : []) as unknown as CompanyRow[];
    },
    enabled: Boolean(org && can),
  });
  return {
    categories: categories.data ?? [],
    costCenters: costCenters.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
    accounts: accounts.data?.rows ?? [],
    companies: companies.data ?? [],
  };
}

export function FinanceDashboardPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("finance.read");
  const canDashboard = hasPermission("finance.dashboard");
  const q = useQuery({
    queryKey: ["finance", "dashboard", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "dashboard", filters: {}, page: 1 } })) as DashboardSummary,
    enabled: Boolean(org && can && canDashboard),
  });
  return (
    <AppShell title="Financeiro · Visão geral">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="finance.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Saldo em caixa</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.balance)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Entradas no período</p>
              <p className="text-xl font-semibold text-emerald-600">{formatMoney(q.data.inflows_period)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Saídas no período</p>
              <p className="text-xl font-semibold text-red-600">{formatMoney(q.data.outflows_period)}</p>
            </div>
            <a href="/financeiro/fluxo" className="rounded border bg-blue-50 p-3 hover:bg-blue-100">
              <p className="text-sm text-blue-700">Previsão em 30 dias</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.projected_30d)}</p>
            </a>
            <a href="/financeiro/receber" className="rounded border p-3 hover:bg-muted">
              <p className="text-sm text-muted-foreground">A receber (aberto)</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.receivable_open)}</p>
            </a>
            <a href="/financeiro/receber" className="rounded border border-red-200 bg-red-50 p-3 hover:bg-red-100">
              <p className="text-sm text-red-700">A receber (vencido)</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.receivable_overdue)}</p>
            </a>
            <a href="/financeiro/pagar" className="rounded border p-3 hover:bg-muted">
              <p className="text-sm text-muted-foreground">A pagar (aberto)</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.payable_open)}</p>
            </a>
            <a href="/financeiro/pagar" className="rounded border border-red-200 bg-red-50 p-3 hover:bg-red-100">
              <p className="text-sm text-red-700">A pagar (vencido)</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.payable_overdue)}</p>
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            Período corrente: {formatDate(q.data.period.from)} a {formatDate(q.data.period.to)}. Vencidos são
            calculados sobre o saldo em aberto após descontos, juros e multa.
          </p>
        </>
      ) : null}
    </AppShell>
  );
}

function statusOptions() {
  return ["OPEN", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELED", "WRITTEN_OFF"];
}

export function FinanceReceivablesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("receivables.read");
  const canManage = hasPermission("receivables.create");
  const options = useFinanceOptions(org, can);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [late, setLate] = useState("");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const filters = { query, status, late };
  useEffect(() => setPage(1), [org, query, status, late]);
  const q = useQuery({
    queryKey: ["finance", "receivables", org, filters, page],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "receivables", filters, page } })) as ReceivableList,
    enabled: Boolean(org && can),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "receivables"] });
    void qc.invalidateQueries({ queryKey: ["finance", "dashboard"] });
  };
  const receipt = (id: string) =>
    exportFinanceCsv(
      `contas-a-receber-${new Date().toISOString().slice(0, 10)}.csv`,
      (q.data?.rows ?? []).map((r) => ({
        Documento: r.document_number,
        Empresa: r.company_name,
        Descricao: r.description,
        Vencimento: r.due_date,
        Original: r.original_amount,
        Aberto: r.open_amount,
        Status: documentStatusLabel(r.status_effective),
      })),
    );
  return (
    <AppShell title="Financeiro · Contas a receber">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="receivables.read" />
      ) : (
        <>
          {openCreate ? (
            <CreateReceivableDialog
              organizationId={org}
              companies={options.companies}
              categories={options.categories}
              costCenters={options.costCenters}
              onClose={() => setOpenCreate(false)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Contas a receber</h2>
            <div className="flex gap-2">
              {hasPermission("finance.export") ? (
                <Button variant="outline" onClick={receipt}>
                  Exportar CSV
                </Button>
              ) : null}
              {canManage ? (
                <Button onClick={() => setOpenCreate(true)}>Nova conta a receber</Button>
              ) : null}
            </div>
          </div>
          {q.isLoading ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <Input
                  className="min-w-48 flex-1"
                  placeholder="Buscar título ou empresa"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Todos os status</option>
                  {statusOptions().map((s) => (
                    <option key={s} value={s}>
                      {documentStatusLabel(s)}
                    </option>
                  ))}
                </select>
                <select aria-label="Vencimento" className={cls} value={late} onChange={(e) => setLate(e.target.value)}>
                  <option value="">Todos os vencimentos</option>
                  <option value="overdue">Somente vencidos</option>
                  <option value="not_overdue">Fora de vencimento</option>
                </select>
              </div>
              {(q.data?.rows ?? []).length === 0 ? (
                <EmptyState title="Nenhuma conta a receber" description="Crie um novo título ou ajuste os filtros." />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2 pr-4">Documento</th>
                            <th className="pb-2 pr-4">Empresa</th>
                            <th className="pb-2 pr-4">Vencimento</th>
                            <th className="pb-2 pr-4 text-right">Aberto</th>
                            <th className="pb-2 pr-4 text-right">Recebido</th>
                            <th className="pb-2 pr-4">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(q.data?.rows ?? []).map((r) => (
                            <tr key={r.id} className="border-b hover:bg-muted/40">
                              <td className="py-2 pr-4">
                                <a href={href("receivable", r.id)} className="font-mono text-xs underline">
                                  {r.document_number}
                                </a>
                                <p className="text-muted-foreground">{r.description}</p>
                              </td>
                              <td className="py-2 pr-4">{r.company_name}</td>
                              <td className="py-2 pr-4">{formatDate(r.due_date)}</td>
                              <td className="py-2 pr-4 text-right">{formatMoney(r.open_amount)}</td>
                              <td className="py-2 pr-4 text-right">{formatMoney(r.received_amount)}</td>
                              <td className="py-2 pr-4">
                                <BadgeStatus status={r.status_effective} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page} · {q.data?.total ?? 0} títulos
                </span>
                <Button
                  variant="outline"
                  disabled={(page + 1) * 50 > (q.data?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

export function FinanceReceivableDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("receivables.read");
  const options = useFinanceOptions(org, can);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["finance", "receivable", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "receivable", filters: { id }, page: 1 },
      })) as ReceivableDetail,
    enabled: Boolean(org && can && id),
  });
  const [settleOpen, setSettleOpen] = useState(false);
  const [op, setOp] = useState<DocumentOp | null>(null);
  const [reverseSettlement, setReverseSettlement] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "receivable"] });
    void qc.invalidateQueries({ queryKey: ["finance", "receivables"] });
    void qc.invalidateQueries({ queryKey: ["finance", "dashboard"] });
  };
  const canSettle = hasPermission("receivables.settle");
  const canCancel = hasPermission("receivables.cancel");
  const canWriteOff = hasPermission("receivables.write_off");
  const canUpdate = hasPermission("receivables.update");
  return (
    <AppShell title="Financeiro · Título a receber">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="receivables.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data ? (
        <>
          {settleOpen ? (
            <SettleDialog
              organizationId={org}
              kind="receivable"
              documentId={q.data.id}
              documentNumber={q.data.document_number}
              accounts={options.accounts}
              categories={options.categories}
              costCenters={options.costCenters}
              paymentMethods={options.paymentMethods}
              onClose={() => setSettleOpen(false)}
              onSaved={refresh}
            />
          ) : null}
          {op ? (
            <DocumentActionDialog
              organizationId={org}
              kind="receivable"
              documentId={q.data.id}
              op={op}
              categories={options.categories}
              costCenters={options.costCenters}
              onClose={() => setOp(null)}
              onSaved={refresh}
            />
          ) : null}
          {reverseSettlement ? (
            <ReverseDialog
              organizationId={org}
              kind="receivable"
              settlementId={reverseSettlement}
              onClose={() => setReverseSettlement(null)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">
              {q.data.document_number} · {q.data.company_name}
            </h2>
            <div className="flex flex-wrap gap-2">
              {canSettle ? (
                <Button onClick={() => setSettleOpen(true)}>Registrar recebimento</Button>
              ) : null}
              {canUpdate ? (
                <>
                  <Button variant="outline" onClick={() => setOp("adjust")}>
                    Ajuste
                  </Button>
                  <Button variant="outline" onClick={() => setOp("discount")}>
                    Desconto
                  </Button>
                  <Button variant="outline" onClick={() => setOp("charges")}>
                    Juros/multa
                  </Button>
                  <Button variant="outline" onClick={() => setOp("due_date")}>
                    Vencimento
                  </Button>
                  <Button variant="outline" onClick={() => setOp("category")}>
                    Classificar
                  </Button>
                </>
              ) : null}
              {canWriteOff ? (
                <Button variant="outline" className="text-purple-700" onClick={() => setOp("write_off")}>
                  Baixar
                </Button>
              ) : null}
              {canCancel ? (
                <Button variant="outline" className="text-red-700" onClick={() => setOp("cancel")}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Título</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Status</p>
                <BadgeStatus status={q.data.status_effective} />
              </div>
              <div>
                <p className="text-muted-foreground">Valor original</p>
                <p>{formatMoney(q.data.original_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo aberto</p>
                <p className="font-semibold">{formatMoney(q.data.open_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expedição</p>
                <p>{formatDate(q.data.issue_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Vencimento</p>
                <p>{formatDate(q.data.due_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Competência</p>
                <p>{formatDate(q.data.competence_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Parcela</p>
                <p>
                  {q.data.installment_number}/{q.data.total_installments}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Recebido</p>
                <p>{formatMoney(q.data.received_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Fonte</p>
                <p>
                  {q.data.source_type}·{q.data.source_status}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Descrição</p>
                <p>{q.data.description}</p>
              </div>
              {q.data.notes ? (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Observações</p>
                  <p>{q.data.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recebimentos ({q.data.settlements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {q.data.settlements.length === 0 ? (
                <EmptyState title="Nenhum recebimento" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2 pr-4">Conta</th>
                        <th className="pb-2 pr-4 text-right">Valor</th>
                        <th className="pb-2 pr-4 text-right">Desconto</th>
                        <th className="pb-2 pr-4">Tipo</th>
                        {hasPermission("receivables.reverse") ? <th className="pb-2" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.settlements.map((s) => (
                        <tr key={s.id} className="border-b">
                          <td className="py-2 pr-4">{formatDateTime(s.settled_at)}</td>
                          <td className="py-2 pr-4">{s.account_name}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(s.amount)}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(s.discount_amount)}</td>
                          <td className="py-2 pr-4">{s.is_reversal ? "Estorno" : "Recebimento"}</td>
                          {hasPermission("receivables.reverse") ? (
                            <td className="py-2 text-right">
                              {!s.is_reversal ? (
                                <Button variant="outline" size="sm" onClick={() => setReverseSettlement(s.id)}>
                                  Estornar
                                </Button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </AppShell>
  );
}

function ReverseDialog({
  organizationId,
  kind,
  settlementId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  kind: "receivable" | "payable";
  settlementId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(reverseTransaction);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      fn({ data: { organizationId, kind, settlementId, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("Lançamento estornado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
        <h3 className="font-heading text-lg font-semibold">Estornar lançamento</h3>
        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Motivo *</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obrigatório" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!reason.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
              Estornar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinancePayablesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("payables.read");
  const canManage = hasPermission("payables.create");
  const options = useFinanceOptions(org, can);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [late, setLate] = useState("");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const filters = { query, status, late };
  useEffect(() => setPage(1), [org, query, status, late]);
  const q = useQuery({
    queryKey: ["finance", "payables", org, filters, page],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "payables", filters, page } })) as PayableList,
    enabled: Boolean(org && can),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "payables"] });
    void qc.invalidateQueries({ queryKey: ["finance", "dashboard"] });
  };
  const receipt = (id: string) =>
    exportFinanceCsv(
      `contas-a-pagar-${new Date().toISOString().slice(0, 10)}.csv`,
      (q.data?.rows ?? []).map((r) => ({
        Documento: r.document_number,
        Empresa: r.company_name ?? "",
        Descricao: r.description,
        Vencimento: r.due_date,
        Original: r.original_amount,
        Aberto: r.open_amount,
        Status: documentStatusLabel(r.status_effective),
      })),
    );
  return (
    <AppShell title="Financeiro · Contas a pagar">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="payables.read" />
      ) : (
        <>
          {openCreate ? (
            <CreatePayableDialog
              organizationId={org}
              companies={options.companies}
              categories={options.categories}
              costCenters={options.costCenters}
              onClose={() => setOpenCreate(false)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Contas a pagar</h2>
            <div className="flex gap-2">
              {hasPermission("finance.export") ? (
                <Button variant="outline" onClick={receipt}>
                  Exportar CSV
                </Button>
              ) : null}
              {canManage ? (
                <Button onClick={() => setOpenCreate(true)}>Nova conta a pagar</Button>
              ) : null}
            </div>
          </div>
          {q.isLoading ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <Input
                  className="min-w-48 flex-1"
                  placeholder="Buscar título ou empresa"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Todos os status</option>
                  {statusOptions().map((s) => (
                    <option key={s} value={s}>
                      {documentStatusLabel(s)}
                    </option>
                  ))}
                </select>
                <select aria-label="Vencimento" className={cls} value={late} onChange={(e) => setLate(e.target.value)}>
                  <option value="">Todos os vencimentos</option>
                  <option value="overdue">Somente vencidos</option>
                  <option value="not_overdue">Fora de vencimento</option>
                </select>
              </div>
              {(q.data?.rows ?? []).length === 0 ? (
                <EmptyState title="Nenhuma conta a pagar" description="Crie um novo título ou ajuste os filtros." />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2 pr-4">Documento</th>
                            <th className="pb-2 pr-4">Empresa</th>
                            <th className="pb-2 pr-4">Vencimento</th>
                            <th className="pb-2 pr-4 text-right">Aberto</th>
                            <th className="pb-2 pr-4 text-right">Pago</th>
                            <th className="pb-2 pr-4">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(q.data?.rows ?? []).map((r) => (
                            <tr key={r.id} className="border-b hover:bg-muted/40">
                              <td className="py-2 pr-4">
                                <a href={href("payable", r.id)} className="font-mono text-xs underline">
                                  {r.document_number}
                                </a>
                                <p className="text-muted-foreground">{r.description}</p>
                              </td>
                              <td className="py-2 pr-4">{r.company_name ?? "—"}</td>
                              <td className="py-2 pr-4">{formatDate(r.due_date)}</td>
                              <td className="py-2 pr-4 text-right">{formatMoney(r.open_amount)}</td>
                              <td className="py-2 pr-4 text-right">{formatMoney(r.paid_amount)}</td>
                              <td className="py-2 pr-4">
                                <BadgeStatus status={r.status_effective} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page} · {q.data?.total ?? 0} títulos
                </span>
                <Button
                  variant="outline"
                  disabled={(page + 1) * 50 > (q.data?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

export function FinancePayableDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("payables.read");
  const options = useFinanceOptions(org, can);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["finance", "payable", org, id],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "payable", filters: { id }, page: 1 } })) as PayableDetail,
    enabled: Boolean(org && can && id),
  });
  const [settleOpen, setSettleOpen] = useState(false);
  const [op, setOp] = useState<DocumentOp | null>(null);
  const [reverseSettlement, setReverseSettlement] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "payable"] });
    void qc.invalidateQueries({ queryKey: ["finance", "payables"] });
    void qc.invalidateQueries({ queryKey: ["finance", "dashboard"] });
  };
  const canSettle = hasPermission("payables.settle");
  const canCancel = hasPermission("payables.cancel");
  const canUpdate = hasPermission("payables.update");
  return (
    <AppShell title="Financeiro · Título a pagar">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="payables.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data ? (
        <>
          {settleOpen ? (
            <SettleDialog
              organizationId={org}
              kind="payable"
              documentId={q.data.id}
              documentNumber={q.data.document_number}
              accounts={options.accounts}
              categories={options.categories}
              costCenters={options.costCenters}
              paymentMethods={options.paymentMethods}
              onClose={() => setSettleOpen(false)}
              onSaved={refresh}
            />
          ) : null}
          {op ? (
            <DocumentActionDialog
              organizationId={org}
              kind="payable"
              documentId={q.data.id}
              op={op}
              categories={options.categories}
              costCenters={options.costCenters}
              onClose={() => setOp(null)}
              onSaved={refresh}
            />
          ) : null}
          {reverseSettlement ? (
            <ReverseDialog
              organizationId={org}
              kind="payable"
              settlementId={reverseSettlement}
              onClose={() => setReverseSettlement(null)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">
              {q.data.document_number} · {q.data.company_name ?? "Sem empresa"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {canSettle ? (
                <Button onClick={() => setSettleOpen(true)}>Registrar pagamento</Button>
              ) : null}
              {canUpdate ? (
                <>
                  <Button variant="outline" onClick={() => setOp("adjust")}>
                    Ajuste
                  </Button>
                  <Button variant="outline" onClick={() => setOp("due_date")}>
                    Vencimento
                  </Button>
                  <Button variant="outline" onClick={() => setOp("category")}>
                    Classificar
                  </Button>
                </>
              ) : null}
              {canCancel ? (
                <Button variant="outline" className="text-red-700" onClick={() => setOp("cancel")}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Título</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Status</p>
                <BadgeStatus status={q.data.status_effective} />
              </div>
              <div>
                <p className="text-muted-foreground">Valor original</p>
                <p>{formatMoney(q.data.original_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo aberto</p>
                <p className="font-semibold">{formatMoney(q.data.open_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expedição</p>
                <p>{formatDate(q.data.issue_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Vencimento</p>
                <p>{formatDate(q.data.due_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Competência</p>
                <p>{formatDate(q.data.competence_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pago</p>
                <p>{formatMoney(q.data.paid_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Fonte</p>
                <p>
                  {q.data.source_type}·{q.data.source_status}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Descrição</p>
                <p>{q.data.description}</p>
              </div>
              {q.data.notes ? (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Observações</p>
                  <p>{q.data.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pagamentos ({q.data.settlements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {q.data.settlements.length === 0 ? (
                <EmptyState title="Nenhum pagamento" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2 pr-4">Conta</th>
                        <th className="pb-2 pr-4 text-right">Valor</th>
                        <th className="pb-2 pr-4 text-right">Desconto</th>
                        <th className="pb-2 pr-4">Tipo</th>
                        {hasPermission("payables.reverse") ? <th className="pb-2" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.settlements.map((s) => (
                        <tr key={s.id} className="border-b">
                          <td className="py-2 pr-4">{formatDateTime(s.settled_at)}</td>
                          <td className="py-2 pr-4">{s.account_name}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(s.amount)}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(s.discount_amount)}</td>
                          <td className="py-2 pr-4">{s.is_reversal ? "Estorno" : "Pagamento"}</td>
                          {hasPermission("payables.reverse") ? (
                            <td className="py-2 text-right">
                              {!s.is_reversal ? (
                                <Button variant="outline" size="sm" onClick={() => setReverseSettlement(s.id)}>
                                  Estornar
                                </Button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </AppShell>
  );
}

export function FinanceTransactionsPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("finance.read");
  const options = useFinanceOptions(org, can);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openDirect, setOpenDirect] = useState(false);
  const filters = { query, account_id: accountId, direction, from, to };
  useEffect(() => setPage(1), [org, query, accountId, direction, from, to]);
  const q = useQuery({
    queryKey: ["finance", "transactions", org, filters, page],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "transactions", filters, page } })) as TransactionList,
    enabled: Boolean(org && can),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "transactions"] });
    void qc.invalidateQueries({ queryKey: ["finance", "accounts"] });
    void qc.invalidateQueries({ queryKey: ["finance", "dashboard"] });
  };
  const receipt = () =>
    exportFinanceCsv(
      `lancamentos-${new Date().toISOString().slice(0, 10)}.csv`,
      (q.data?.rows ?? []).map((t) => ({
        Data: t.occurred_at,
        Tipo: transactionTypeLabel(t.type),
        Direcao: transactionDirectionLabel(t.direction),
        Conta: t.account_name,
        Empresa: t.company_name ?? "",
        Documento: t.document_number ?? "",
        Descricao: t.description ?? "",
        Valor: t.amount,
        Status: t.status,
      })),
    );
  return (
    <AppShell title="Financeiro · Lançamentos">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="finance.read" />
      ) : (
        <>
          {openDirect ? (
            <DirectMovementDialog
              organizationId={org}
              accounts={options.accounts}
              companies={options.companies}
              categories={options.categories}
              costCenters={options.costCenters}
              paymentMethods={options.paymentMethods}
              onClose={() => setOpenDirect(false)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Lançamentos no ledger</h2>
            <div className="flex gap-2">
              {hasPermission("finance.export") ? (
                <Button variant="outline" onClick={receipt}>
                  Exportar CSV
                </Button>
              ) : null}
              {hasPermission("finance.manage") ? (
                <Button onClick={() => setOpenDirect(true)}>Movimento avulso</Button>
              ) : null}
            </div>
          </div>
          {q.isLoading ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <Input
                  className="min-w-48 flex-1"
                  placeholder="Buscar descrição, conta ou documento"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Conta"
                  className={cls}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Todas as contas</option>
                  {options.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Direção" className={cls} value={direction} onChange={(e) => setDirection(e.target.value)}>
                  <option value="">Entradas e saídas</option>
                  <option value="IN">Entradas</option>
                  <option value="OUT">Saídas</option>
                </select>
                <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
                <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
              </div>
              {(q.data?.rows ?? []).length === 0 ? (
                <EmptyState title="Nenhum lançamento" />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2 pr-4">Data</th>
                            <th className="pb-2 pr-4">Conta</th>
                            <th className="pb-2 pr-4">Tipo</th>
                            <th className="pb-2 pr-4">Documento</th>
                            <th className="pb-2 pr-4">Descrição</th>
                            <th className="pb-2 pr-4 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(q.data?.rows ?? []).map((t) => (
                            <tr key={t.id} className="border-b hover:bg-muted/40">
                              <td className="py-2 pr-4">{formatDateTime(t.occurred_at)}</td>
                              <td className="py-2 pr-4">{t.account_name}</td>
                              <td className="py-2 pr-4">
                                <Badge variant={t.direction === "IN" ? "default" : "secondary"}>
                                  {transactionTypeLabel(t.type)}
                                </Badge>
                              </td>
                              <td className="py-2 pr-4 font-mono text-xs">{t.document_number ?? "—"}</td>
                              <td className="py-2 pr-4">{t.description ?? "—"}</td>
                              <td
                                className={`py-2 pr-4 text-right font-medium ${
                                  t.direction === "IN" ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {t.direction === "IN" ? "+" : "−"}
                                {formatMoney(t.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page} · {q.data?.total ?? 0} lançamentos
                </span>
                <Button
                  variant="outline"
                  disabled={(page + 1) * 50 > (q.data?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

export function FinanceCashflowPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("finance.read");
  const [days, setDays] = useState("30");
  const q = useQuery({
    queryKey: ["finance", "cashflow", org, days],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "cashflow", filters: { days }, page: 1 },
      })) as CashflowSummary,
    enabled: Boolean(org && can),
  });
  return (
    <AppShell title="Financeiro · Fluxo de caixa">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="finance.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">
              Fluxo de caixa · {formatDate(q.data.from)} a {formatDate(q.data.to)}
            </h2>
            <select aria-label="Horizonte" className={cls} value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">Próximos 7 dias</option>
              <option value="15">Próximos 15 dias</option>
              <option value="30">Próximos 30 dias</option>
              <option value="60">Próximos 60 dias</option>
              <option value="90">Próximos 90 dias</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Saldo atual</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.balance)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Realizado no período</p>
              <p className="text-xl font-semibold">{formatMoney(q.data.realized_from)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Entradas (realizadas)</p>
              <p className="text-xl font-semibold text-emerald-600">{formatMoney(q.data.realized_in)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Saídas (realizadas)</p>
              <p className="text-xl font-semibold text-red-600">{formatMoney(q.data.realized_out)}</p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projeção diária</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Dia</th>
                      <th className="pb-2 pr-4 text-right">Saldo inicial</th>
                      <th className="pb-2 pr-4 text-right">Realizado</th>
                      <th className="pb-2 pr-4 text-right">Projetado</th>
                      <th className="pb-2 pr-4 text-right">Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.days.map((d) => {
                      const final =
                        d.opening +
                        d.realized_in -
                        d.realized_out +
                        d.projected_in -
                        d.projected_out;
                      return (
                        <tr key={d.dt} className="border-b">
                          <td className="py-2 pr-4">{formatDate(d.dt)}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(d.opening)}</td>
                          <td className="py-2 pr-4 text-right">
                            <span className="text-emerald-600">+{formatMoney(d.realized_in)}</span>{" "}
                            <span className="text-red-600">−{formatMoney(d.realized_out)}</span>
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <span className="text-emerald-600/80">+{formatMoney(d.projected_in)}</span>{" "}
                            <span className="text-red-600/80">−{formatMoney(d.projected_out)}</span>
                          </td>
                          <td className={`py-2 pr-4 text-right font-medium ${final < 0 ? "text-red-600" : ""}`}>
                            {formatMoney(final)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            Projeções usam títulos em aberto e recorrências ativas por vencimento. Dívida de fornecedores e contas
            incobráveis não são projetadas.
          </p>
        </>
      ) : null}
    </AppShell>
  );
}

export function FinanceAccountsPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("financial_accounts.read");
  const canManage = hasPermission("financial_accounts.manage");
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [openOpening, setOpenOpening] = useState(false);
  const [editing, setEditing] = useState<FinancialAccountRow | null>(null);
  const q = useQuery({
    queryKey: ["finance", "accounts", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "accounts", filters: {}, page: 1 } })) as {
        rows: FinancialAccountRow[];
        total: number;
      },
    enabled: Boolean(org && can),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "accounts"] });
    void qc.invalidateQueries({ queryKey: ["finance", "dashboard"] });
  };
  return (
    <AppShell title="Financeiro · Contas">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="financial_accounts.read" />
      ) : (
        <>
          {(openNew || editing) && canManage ? (
            <SaveAccountDialog
              organizationId={org}
              isEdit={Boolean(editing)}
              initial={editing}
              onClose={() => {
                setOpenNew(false);
                setEditing(null);
              }}
              onSaved={refresh}
            />
          ) : null}
          {openTransfer && canManage ? (
            <TransferDialog
              organizationId={org}
              accounts={q.data?.rows ?? []}
              onClose={() => setOpenTransfer(false)}
              onSaved={refresh}
            />
          ) : null}
          {openOpening && canManage ? (
            <OpeningBalanceDialog
              organizationId={org}
              accounts={q.data?.rows ?? []}
              onClose={() => setOpenOpening(false)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Contas financeiras</h2>
            <div className="flex gap-2">
              {canManage ? (
                <>
                  <Button variant="outline" onClick={() => setOpenOpening(true)}>
                    Saldo inicial
                  </Button>
                  <Button variant="outline" onClick={() => setOpenTransfer(true)}>
                    Transferir
                  </Button>
                  <Button onClick={() => setOpenNew(true)}>Nova conta</Button>
                </>
              ) : null}
            </div>
          </div>
          {q.isLoading ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : (q.data?.rows ?? []).length === 0 ? (
            <EmptyState title="Nenhuma conta financeira" description="Crie uma conta para registrar o caixa." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Conta</th>
                        <th className="pb-2 pr-4">Tipo</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4 text-right">Saldo</th>
                        <th className="pb-2 pr-4 text-right">Saldo inicial ref.</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(q.data?.rows ?? []).map((a) => (
                        <tr key={a.id} className="border-b">
                          <td className="py-2 pr-4">
                            {a.name}
                            {a.bank_name || a.agency ? (
                              <p className="text-xs text-muted-foreground">
                                {[a.bank_name, a.agency, a.account_reference].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-4">{accountTypeLabel(a.type)}</td>
                          <td className="py-2 pr-4">
                            <Badge variant={a.status === "ACTIVE" ? "default" : "secondary"}>
                              {accountStatusLabel(a.status)}
                            </Badge>
                          </td>
                          <td className={`py-2 pr-4 text-right font-medium ${a.balance < 0 ? "text-red-600" : ""}`}>
                            {formatMoney(a.balance)}
                          </td>
                          <td className="py-2 pr-4 text-right">{formatMoney(a.opening_balance_reference)}</td>
                          <td className="py-2 text-right">
                            {canManage ? (
                              <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                                Editar
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}

function reportPeriod(months: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months + 1);
  from.setDate(1);
  const pad = (d: Date) => d.toISOString().slice(0, 10);
  return { from: pad(from), to: pad(to) };
}

export function FinanceReportsPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("finance.read");
  const [months, setMonths] = useState("3");
  const { from, to } = reportPeriod(Number(months));
  const [side, setSide] = useState("receivable");
  const catQ = useQuery({
    queryKey: ["finance", "report_category", org, from, to],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "report_category", filters: { from, to }, page: 1 },
      })) as { from: string; to: string; rows: { code: string; name: string; type: string; inflows_realized: number; outflows_realized: number; inflows_projected: number; outflows_projected: number }[] },
    enabled: Boolean(org && can),
  });
  const ccQ = useQuery({
    queryKey: ["finance", "report_cost_center", org, from, to],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "report_cost_center", filters: { from, to }, page: 1 },
      })) as { from: string; to: string; rows: { code: string; name: string; inflows_realized: number; outflows_realized: number }[] },
    enabled: Boolean(org && can),
  });
  const agingQ = useQuery({
    queryKey: ["finance", "aging", org, side],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "aging", filters: { side }, page: 1 },
      })) as AgingSummary,
    enabled: Boolean(org && can),
  });
  return (
    <AppShell title="Financeiro · Relatórios">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="finance.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Relatórios de resultados</h2>
            <select aria-label="Período" className={cls} value={months} onChange={(e) => setMonths(e.target.value)}>
              <option value="1">Mês corrente</option>
              <option value="3">Últimos 3 meses</option>
              <option value="6">Últimos 6 meses</option>
              <option value="12">Últimos 12 meses</option>
            </select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {catQ.isLoading ? (
                <LoadingState />
              ) : catQ.error ? (
                <ErrorState description={catQ.error.message} onRetry={() => void catQ.refetch()} />
              ) : (catQ.data?.rows ?? []).length === 0 ? (
                <EmptyState title="Sem dados no período" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Categoria</th>
                        <th className="pb-2 pr-4">Tipo</th>
                        <th className="pb-2 pr-4 text-right">Entradas</th>
                        <th className="pb-2 pr-4 text-right">Saídas</th>
                        <th className="pb-2 pr-4 text-right">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(catQ.data?.rows ?? []).map((r) => (
                        <tr key={r.code} className="border-b">
                          <td className="py-2 pr-4">
                            {r.name}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{r.code}</span>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant={r.type === "REVENUE" ? "default" : "secondary"}>{categoryTypeLabel(r.type)}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-right text-emerald-600">{formatMoney(r.inflows_realized)}</td>
                          <td className="py-2 pr-4 text-right text-red-600">{formatMoney(r.outflows_realized)}</td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {formatMoney(r.inflows_realized - r.outflows_realized)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado por centro de custo</CardTitle>
            </CardHeader>
            <CardContent>
              {ccQ.isLoading ? (
                <LoadingState />
              ) : ccQ.error ? (
                <ErrorState description={ccQ.error.message} onRetry={() => void ccQ.refetch()} />
              ) : (ccQ.data?.rows ?? []).length === 0 ? (
                <EmptyState title="Sem dados no período" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Centro de custo</th>
                        <th className="pb-2 pr-4 text-right">Entradas</th>
                        <th className="pb-2 pr-4 text-right">Saídas</th>
                        <th className="pb-2 pr-4 text-right">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ccQ.data?.rows ?? []).map((r) => (
                        <tr key={r.code} className="border-b">
                          <td className="py-2 pr-4">
                            {r.name}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{r.code}</span>
                          </td>
                          <td className="py-2 pr-4 text-right text-emerald-600">{formatMoney(r.inflows_realized)}</td>
                          <td className="py-2 pr-4 text-right text-red-600">{formatMoney(r.outflows_realized)}</td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {formatMoney(r.inflows_realized - r.outflows_realized)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aging de contas a receber</CardTitle>
            </CardHeader>
            <CardContent>
              {agingQ.isLoading ? (
                <LoadingState />
              ) : agingQ.error ? (
                <ErrorState description={agingQ.error.message} onRetry={() => void agingQ.refetch()} />
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={side === "receivable" ? "default" : "outline"} size="sm" onClick={() => setSide("receivable")}>
                      A receber
                    </Button>
                    <Button variant={side === "payable" ? "default" : "outline"} size="sm" onClick={() => setSide("payable")}>
                      A pagar
                    </Button>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">Faixa</th>
                          <th className="pb-2 pr-4 text-right">Títulos</th>
                          <th className="pb-2 pr-4 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(agingQ.data?.rows ?? []).map((r) => (
                          <tr key={r.bucket} className="border-b">
                            <td className="py-2 pr-4">{r.bucket}</td>
                            <td className="py-2 pr-4 text-right">{formatNumber(r.documents, 0)}</td>
                            <td className="py-2 pr-4 text-right font-medium">{formatMoney(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

export function FinanceRecurrencesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const gen = useServerFn(generateRecurrences);
  const can = hasPermission("finance.read");
  const canManage = hasPermission("finance.manage");
  const options = useFinanceOptions(org, can);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const q = useQuery({
    queryKey: ["finance", "recurrences", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "recurrences", filters: {}, page: 1 } })) as RecurrenceRow[],
    enabled: Boolean(org && can),
  });
  const genMutation = useMutation({
    mutationFn: () => gen({ data: { organizationId: org!, referenceMonth: `${month}-01` } }),
    onSuccess: () => {
      toast.success("Recorrências geradas");
      void qc.invalidateQueries({ queryKey: ["finance", "recurrences"] });
      void qc.invalidateQueries({ queryKey: ["finance", "cashflow"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "recurrences"] });
    void qc.invalidateQueries({ queryKey: ["finance", "cashflow"] });
  };
  return (
    <AppShell title="Financeiro · Recorrências">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="finance.read" />
      ) : (
        <>
          {open && canManage ? (
            <SaveRecurrenceDialog
              organizationId={org}
              companies={options.companies}
              categories={options.categories}
              costCenters={options.costCenters}
              paymentMethods={options.paymentMethods}
              onClose={() => setOpen(false)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Recorrências mensais</h2>
            <div className="flex gap-2">
              <Input
                type="month"
                className="w-44"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Competência"
              />
              {canManage ? (
                <>
                  <Button variant="outline" disabled={genMutation.isPending} onClick={() => genMutation.mutate()}>
                    Gerar competência
                  </Button>
                  <Button onClick={() => setOpen(true)}>Nova recorrência</Button>
                </>
              ) : null}
            </div>
          </div>
          {q.isLoading ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : (q.data ?? []).length === 0 ? (
            <EmptyState title="Nenhuma recorrência" description="Ex.: aluguel, salários, mensalidades." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Recorrência</th>
                        <th className="pb-2 pr-4">Direção</th>
                        <th className="pb-2 pr-4">Empresa</th>
                        <th className="pb-2 pr-4 text-right">Valor</th>
                        <th className="pb-2 pr-4">Dia</th>
                        <th className="pb-2 pr-4">Período</th>
                        <th className="pb-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(q.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="py-2 pr-4">
                            {r.name}
                            {r.category_name ? (
                              <p className="text-xs text-muted-foreground">{r.category_name}</p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant={r.direction === "IN" ? "default" : "secondary"}>
                              {recurrenceDirectionLabel(r.direction)}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4">{r.company_name ?? "—"}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(r.amount)}</td>
                          <td className="py-2 pr-4">{r.day_of_month}</td>
                          <td className="py-2 pr-4">
                            {formatDate(r.start_date)} → {formatDate(r.end_date)}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>
                              {activeStatusLabel(r.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}

export function FinanceSettingsPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("financial_categories.read");
  const canManage = hasPermission("financial_categories.manage");
  const canSettings = hasPermission("finance.manage");
  const qc = useQueryClient();
  const [catOpen, setCatOpen] = useState(false);
  const [ccOpen, setCcOpen] = useState(false);
  const [pmOpen, setPmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<FinancialCategoryRow | null>(null);
  const [editingCc, setEditingCc] = useState<CostCenterRow | null>(null);
  const [editingPm, setEditingPm] = useState<PaymentMethodRow | null>(null);
  const settingsQ = useQuery({
    queryKey: ["finance", "settings", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "settings", filters: {}, page: 1 } })) as FinanceSettings,
    enabled: Boolean(org && can && canSettings),
  });
  const cats = useQuery({
    queryKey: ["finance", "categories", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "categories", filters: {}, page: 1 } })) as FinancialCategoryRow[],
    enabled: Boolean(org && can),
  });
  const ccs = useQuery({
    queryKey: ["finance", "cost_centers", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "cost_centers", filters: {}, page: 1 } })) as CostCenterRow[],
    enabled: Boolean(org && can),
  });
  const pms = useQuery({
    queryKey: ["finance", "payment_methods", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "payment_methods", filters: {}, page: 1 } })) as PaymentMethodRow[],
    enabled: Boolean(org && can),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["finance", "categories"] });
    void qc.invalidateQueries({ queryKey: ["finance", "cost_centers"] });
    void qc.invalidateQueries({ queryKey: ["finance", "payment_methods"] });
    void qc.invalidateQueries({ queryKey: ["finance", "settings"] });
  };
  return (
    <AppShell title="Financeiro · Configurações">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="financial_categories.read" />
      ) : (
        <>
          {(catOpen || editingCat) && canManage ? (
            <SaveCategoryDialog
              organizationId={org}
              isEdit={Boolean(editingCat)}
              initial={editingCat}
              onClose={() => {
                setCatOpen(false);
                setEditingCat(null);
              }}
              onSaved={refresh}
            />
          ) : null}
          {(ccOpen || editingCc) && canManage ? (
            <SaveCostCenterDialog
              organizationId={org}
              isEdit={Boolean(editingCc)}
              initial={editingCc}
              onClose={() => {
                setCcOpen(false);
                setEditingCc(null);
              }}
              onSaved={refresh}
            />
          ) : null}
          {(pmOpen || editingPm) && canManage ? (
            <SavePaymentMethodDialog
              organizationId={org}
              isEdit={Boolean(editingPm)}
              initial={editingPm}
              onClose={() => {
                setPmOpen(false);
                setEditingPm(null);
              }}
              onSaved={refresh}
            />
          ) : null}
          {settingsOpen && canSettings ? (
            <SettingsDialog
              organizationId={org}
              initial={
                settingsQ.data ?? {
                  organization_id: org,
                  currency: "BRL",
                  partner_receivable_due_days: 7,
                  partner_receivable_installments: 1,
                  updated_by: null,
                  updated_at: "",
                }
              }
              onClose={() => setSettingsOpen(false)}
              onSaved={refresh}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Configurações do financeiro</h2>
            {canSettings ? (
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                Configurações de cobrança
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Categorias</CardTitle>
                {canManage ? (
                  <Button size="sm" onClick={() => setCatOpen(true)}>
                    Nova
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {cats.isLoading ? (
                  <LoadingState rows={2} />
                ) : (cats.data ?? []).length === 0 ? (
                  <EmptyState title="Nenhuma categoria" />
                ) : (
                  <ul className="divide-y">
                    {(cats.data ?? []).map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-2">
                        <div>
                          <p>{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.code} · {categoryTypeLabel(c.type)}
                          </p>
                        </div>
                        {canManage ? (
                          <Button variant="ghost" size="sm" onClick={() => setEditingCat(c)}>
                            Editar
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Centros de custo</CardTitle>
                {canManage ? (
                  <Button size="sm" onClick={() => setCcOpen(true)}>
                    Novo
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {ccs.isLoading ? (
                  <LoadingState rows={2} />
                ) : (ccs.data ?? []).length === 0 ? (
                  <EmptyState title="Nenhum centro" />
                ) : (
                  <ul className="divide-y">
                    {(ccs.data ?? []).map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-2">
                        <div>
                          <p>{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.code}</p>
                        </div>
                        {canManage ? (
                          <Button variant="ghost" size="sm" onClick={() => setEditingCc(c)}>
                            Editar
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Formas de pagamento</CardTitle>
                {canManage ? (
                  <Button size="sm" onClick={() => setPmOpen(true)}>
                    Nova
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {pms.isLoading ? (
                  <LoadingState rows={2} />
                ) : (pms.data ?? []).length === 0 ? (
                  <EmptyState title="Nenhuma forma" />
                ) : (
                  <ul className="divide-y">
                    {(pms.data ?? []).map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-2">
                        <div>
                          <p>{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.code}</p>
                        </div>
                        {canManage ? (
                          <Button variant="ghost" size="sm" onClick={() => setEditingPm(c)}>
                            Editar
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}

export function FinanceHistoryPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryFinance);
  const can = hasPermission("finance.read");
  const q = useQuery({
    queryKey: ["finance", "history", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "history", filters: {}, page: 1 } })) as FinanceHistoryRow[],
    enabled: Boolean(org && can),
  });
  return (
    <AppShell title="Financeiro · Histórico">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="finance.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma alteração registrada" />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <ul className="divide-y">
              {(q.data ?? []).map((h, i) => (
                <li key={i} className="py-2 text-sm">
                  <p className="font-medium">{h.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(h.created_at)} · usuário {h.user_id?.slice(0, 8)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}