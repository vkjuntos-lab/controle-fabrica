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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOrganization } from "@/lib/org/org-context";
import {
  queryReconciliation,
  processReconciliation,
  reprocessReconciliationItem,
} from "@/lib/reconciliation/reconciliation.functions";
import type {
  DashboardSummary,
  ReconciliationDetail,
  ReconciliationException,
  ReconciliationItem,
  ReconciliationList,
  ReconciliationRow,
} from "@/lib/reconciliation/types";
import {
  formatMoney,
  formatNumber,
  formatDate,
  formatDateTime,
  reconciliationStatusLabel,
  itemStatusLabel,
  inventoryEffectLabel,
  exceptionTypeLabel,
  severityLabel,
  exceptionStatusLabel,
  frequencyLabel,
  saleStatusLabel,
  adjustmentTypeLabel,
} from "@/lib/reconciliation/constants";
import { exportReconciliationCsv } from "@/lib/reconciliation/export";
import {
  NewReconciliationDialog,
  ResolveExceptionDialog,
  ReopenDialog,
  CloseReconciliationDialog,
  CancelReconciliationDialog,
  AdjustmentDialog,
  ReverseItemDialog,
} from "./dialogs";

const cls = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const href = (id: string) => `/reconciliacao/periodos/${id}`;

export function Navigation() {
  return (
    <nav className="flex flex-wrap gap-2 print:hidden">
      {[
        ["/reconciliacao", "Visão geral"],
        ["/reconciliacao/periodos", "Períodos"],
        ["/reconciliacao/vendas", "Vendas"],
        ["/reconciliacao/excecoes", "Exceções"],
        ["/reconciliacao/tabelas-preco", "Tabelas de preço"],
        ["/reconciliacao/lojas", "Lojas"],
        ["/reconciliacao/mapeamento", "Mapeamento SKU"],
      ].map(([to, label]) => (
        <Button key={to} variant="outline" asChild>
          <a href={to}>{label}</a>
        </Button>
      ))}
    </nav>
  );
}

export function ReconciliationDashboard() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const q = useQuery({
    queryKey: ["reconciliation", "dashboard", org],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "dashboard", filters: {}, page: 1 },
      })) as DashboardSummary,
    enabled: Boolean(org && hasPermission("partner_reconciliation.read")),
  });
  return (
    <AppShell title="Reconciliação · Visão geral">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission("partner_reconciliation.read") ? (
        <PermissionDenied permission="partner_reconciliation.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Vendas aguardando período", q.data.pending_sales, "/reconciliacao/vendas"],
              ["Unidades pendentes", formatNumber(q.data.pending_units), null],
              ["Períodos em aberto", q.data.open_reconciliations, "/reconciliacao/periodos"],
              ["Prontos para fechar", q.data.ready_to_close, "/reconciliacao/periodos"],
              ["Exceções abertas", q.data.open_exceptions, "/reconciliacao/excecoes"],
              ["Exceções bloqueantes", q.data.blocking_exceptions, "/reconciliacao/excecoes"],
              ["SKUs sem mapeamento", q.data.unsigned_sku, "/reconciliacao/mapeamento"],
              ["Períodos fechados", q.data.closed_in_period, null],
            ].map(([label, value, to]) =>
              to ? (
                <a key={String(label)} href={String(to)} className="rounded border p-3 hover:bg-muted">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold">{value}</p>
                </a>
              ) : (
                <div key={String(label)} className="rounded border p-3">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold">{value}</p>
                </div>
              ),
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Vendas importadas aguardam inclusão em um período. Remessa não é venda; uma venda
            reconciliada produz no máximo uma baixa oficial de estoque.
          </p>
        </>
      ) : null}
    </AppShell>
  );
}

function statusOptions() {
  return [
    "DRAFT",
    "PROCESSING",
    "REVIEW_REQUIRED",
    "READY_TO_CLOSE",
    "CLOSED",
    "REOPENED",
    "CANCELED",
  ];
}

export function ReconciliationListPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("partner_reconciliation.read");
  const filters = { query, status, from, to };
  useEffect(() => setPage(1), [org, query, status, from, to]);
  const q = useQuery({
    queryKey: ["reconciliation", "list", org, filters, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "reconciliations", filters, page },
      })) as ReconciliationList,
    enabled: Boolean(org && canRead),
  });
  return (
    <AppShell title="Reconciliação · Períodos">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="partner_reconciliation.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Períodos de reconciliação</h2>
            {hasPermission("partner_reconciliation.create") ? (
              <Button onClick={() => setOpen(true)}>Novo período</Button>
            ) : null}
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap gap-3">
                <Input
                  className="min-w-48 flex-1"
                  placeholder="Parceiro, status ou período"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Todos os status</option>
                  {statusOptions().map((s) => (
                    <option key={s} value={s}>
                      {reconciliationStatusLabel(s)}
                    </option>
                  ))}
                </select>
                <Input aria-label="De" type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input aria-label="Até" type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              {q.isLoading ? (
                <LoadingState />
              ) : q.error ? (
                <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
              ) : !q.data?.rows.length ? (
                <EmptyState
                  title="Nenhum período encontrado"
                  description="Crie o primeiro período para reconciliar as vendas de um parceiro."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(q.data.rows as ReconciliationRow[]).map((r) => (
                    <a
                      key={r.id}
                      href={href(r.id)}
                      className="space-y-2 rounded-lg border p-4 hover:bg-muted"
                    >
                      <div className="flex justify-between gap-3">
                        <strong>{r.partner_name}</strong>
                        <Badge>{reconciliationStatusLabel(r.status)}</Badge>
                      </div>
                      <p>
                        {formatDate(r.period_start)} a {formatDate(r.period_end)} ·{" "}
                        {frequencyLabel(r.frequency)}
                      </p>
                      <p>
                        {r.sales_count} vendas · {formatNumber(r.units_sold)} unidades · gross{" "}
                        {formatMoney(r.gross_amount)} · cobrável {formatMoney(r.billable_amount)}
                      </p>
                      <p>
                        Exceções: {r.exceptions_count ?? 0} ·{" "}
                        {r.status === "CLOSED"
                          ? `Fechado em ${formatDateTime(r.closed_at)}`
                          : `Criado em ${formatDateTime(r.created_at)}`}
                      </p>
                    </a>
                  ))}
                </div>
              )}
              {q.data && q.data.total > 50 ? (
                <div className="flex justify-between">
                  <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <span>
                    Página {page} de {Math.ceil(q.data.total / 50)}
                  </span>
                  <Button disabled={page * 50 >= q.data.total} onClick={() => setPage((p) => p + 1)}>
                    Próxima
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {open && hasPermission("partner_reconciliation.create") ? (
            <NewReconciliationDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                void q.refetch();
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function useDetail(org: string | undefined, id: string, canRead: boolean) {
  const fetch = useServerFn(queryReconciliation);
  return useQuery({
    queryKey: ["reconciliation", "detail", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "reconciliation", filters: { id }, page: 1 },
      })) as ReconciliationDetail,
    enabled: Boolean(org && canRead),
  });
}

export function ReconciliationDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const canRead = hasPermission("partner_reconciliation.read");
  const q = useDetail(org, id, canRead);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["reconciliation"] });
    void qc.invalidateQueries({ queryKey: ["partners", "dashboard"] });
  };
  const process = useServerFn(processReconciliation);
  const reprocess = useServerFn(reprocessReconciliationItem);
  const processMutation = useMutation({
    mutationFn: () => process({ data: { organizationId: org!, reconciliationId: id } }),
    onSuccess: () => {
      toast.success("Reconciliação processada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reprocessMutation = useMutation({
    mutationFn: (itemId: string) =>
      reprocess({ data: { organizationId: org!, itemId } }),
    onSuccess: () => {
      toast.success("Item reprocessado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [dialog, setDialog] = useState<null | "reopen" | "close" | "cancel" | "adjust">(null);
  const [exception, setException] = useState<ReconciliationException | null>(null);
  const [reverseItem, setReverseItem] = useState<ReconciliationItem | null>(null);
  const [exporting, setExporting] = useState(false);
  const d = q.data;
  async function exportDetail() {
    if (!d) return;
    setExporting(true);
    try {
      const items = d.items.map((i) => ({
        ...i,
        billable_amount: i.billable_amount,
        price_snapshot: JSON.stringify(i.price_snapshot ?? {}),
      }));
      const exceptions = d.exceptions.map((x) => ({ ...x, details: JSON.stringify(x.details ?? {}) }));
      exportReconciliationCsv(`${d.partner_name}_${d.period_start}_${d.period_end}.csv`, [
        ...(d.by_day ?? []).map((r) => ({
          secao: "por_dia",
          d: r.d,
          linhas: r.items,
          unidades: r.units,
          cobravel: r.billable,
        })),
        ...(d.by_sku ?? []).map((r) => ({
          secao: "por_sku",
          sku: r.sku,
          produto: r.product_name,
          linhas: r.items,
          unidades: r.units,
          cobravel: r.billable,
        })),
        ...items,
        ...exceptions.map((x) => ({ ...x, secao: "excecao" })),
      ]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <AppShell title={`Reconciliação · Período`}>
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="partner_reconciliation.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <EmptyState title="Período não encontrado" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-heading text-xl font-semibold">{d.partner_name}</p>
              <p>
                {formatDate(d.period_start)} a {formatDate(d.period_end)} · {frequencyLabel(d.frequency)}{" "}
                · <Badge>{reconciliationStatusLabel(d.status)}</Badge>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              {hasPermission("partner_reconciliation.process") &&
              !["CLOSED", "CANCELED"].includes(d.status) ? (
                <Button disabled={processMutation.isPending} onClick={() => processMutation.mutate()}>
                  Processar
                </Button>
              ) : null}
              {hasPermission("partner_reconciliation.close") && d.status === "READY_TO_CLOSE" ? (
                <Button onClick={() => setDialog("close")}>Fechar</Button>
              ) : null}
              {hasPermission("partner_reconciliation.reopen") && d.status === "CLOSED" ? (
                <Button variant="outline" onClick={() => setDialog("reopen")}>
                  Reabrir
                </Button>
              ) : null}
              {hasPermission("partner_reconciliation.reverse") && d.status === "CLOSED" ? (
                <Button variant="outline" onClick={() => setDialog("adjust")}>
                  Ajuste
                </Button>
              ) : null}
              {hasPermission("partner_reconciliation.review") &&
              ["DRAFT", "PROCESSING", "REVIEW_REQUIRED", "REOPENED"].includes(d.status) ? (
                <Button variant="destructive" onClick={() => setDialog("cancel")}>
                  Cancelar
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => void exportDetail()} disabled={exporting}>
                {exporting ? "Exportando..." : "CSV completo"}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Vendas no período", d.sales_count ?? d.items.length],
              ["Unidades", formatNumber(d.units_sold ?? 0)],
              ["Gross (marketplace)", formatMoney(d.gross_amount ?? 0)],
              ["Cobrável (regra comercial)", formatMoney(d.billable_amount ?? 0)],
              [
                "Ajustes",
                formatMoney(
                  (d.snapshot?.totals?.adjustments ?? 0) +
                    d.adjustments.reduce((s, a) => s + (a.adjustment_type === "CREDIT" ? -a.amount : a.amount), 0),
                ),
              ],
              [
                "Cobrável líquido",
                formatMoney(
                  d.snapshot?.totals?.net_billable ?? (d.billable_amount ?? 0),
                ),
              ],
              ["Itens com exceção", d.exceptions.filter((x) => x.status !== "RESOLVED").length],
              ["Fechado em", d.closed_at ? formatDateTime(d.closed_at) : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded border p-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <Tabs defaultValue="itens">
            <TabsList>
              <TabsTrigger value="itens">Itens ({d.items.length})</TabsTrigger>
              <TabsTrigger value="excecoes">Exceções ({d.exceptions.length})</TabsTrigger>
              <TabsTrigger value="ajustes">Ajustes ({d.adjustments.length})</TabsTrigger>
              <TabsTrigger value="consolidado">Consolidado</TabsTrigger>
            </TabsList>
            <TabsContent value="itens">
              {d.items.length ? (
                <div className="space-y-2">
                  {d.items.map((i) => (
                    <div key={i.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>
                          {i.sku ?? i.external_sku} · {i.product_name ?? "Produto"}
                        </strong>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{itemStatusLabel(i.status)}</Badge>
                          <Badge variant="outline">{inventoryEffectLabel(i.inventory_effect_status)}</Badge>
                          {i.exception_status ? (
                            <Badge variant="secondary">{exceptionStatusLabel(i.exception_status)}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-sm">
                        {i.store_name} ({i.marketplace}) · pedido {i.external_order_id} ·{" "}
                        {formatNumber(i.quantity)} un. · gross {formatMoney(i.gross_amount)} · cobrável{" "}
                        {formatMoney(i.billable_amount)}
                      </p>
                      {i.price_snapshot ? (
                        <p className="text-xs text-muted-foreground">
                          Preço de referência: R$ {i.price_snapshot.unit_price?.toFixed(2)} · regra{" "}
                          {i.price_snapshot.rule ?? "—"}
                        </p>
                      ) : null}
                      {i.error_message ? (
                        <p className="text-xs text-destructive">{i.error_message}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 print:hidden">
                        {i.status === "EXCEPTION" &&
                        hasPermission("partner_reconciliation.process") &&
                        !["CLOSED", "CANCELED"].includes(d.status) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={reprocessMutation.isPending}
                            onClick={() => reprocessMutation.mutate(i.id)}
                          >
                            Reprocessar
                          </Button>
                        ) : null}
                        {i.inventory_effect_status === "APPLIED" &&
                        hasPermission("partner_reconciliation.reverse") &&
                        d.status !== "CLOSED" ? (
                          <Button variant="outline" size="sm" onClick={() => setReverseItem(i)}>
                            Estornar baixa
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Nenhum item no período" />
              )}
            </TabsContent>
            <TabsContent value="excecoes">
              {d.exceptions.length ? (
                <div className="space-y-2">
                  {d.exceptions.map((x) => (
                    <div key={x.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{exceptionTypeLabel(x.exception_type)}</strong>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={x.severity === "ERROR" ? "destructive" : x.severity === "WARNING" ? "secondary" : "outline"}>
                            {severityLabel(x.severity)}
                          </Badge>
                          <Badge variant={x.status === "RESOLVED" ? "default" : "secondary"}>
                            {exceptionStatusLabel(x.status)}
                          </Badge>
                        </div>
                      </div>
                      <p>{x.message}</p>
                      <p className="text-xs text-muted-foreground">
                        Criada em {formatDateTime(x.created_at)}
                        {x.resolved_at ? ` · resolvida em ${formatDateTime(x.resolved_at)}` : ""}
                      </p>
                      {x.status !== "RESOLVED" && hasPermission("partner_reconciliation.resolve_exception") ? (
                        <div className="mt-2 print:hidden">
                          <Button variant="outline" size="sm" onClick={() => setException(x)}>
                            Resolver
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Sem exceções abertas" />
              )}
            </TabsContent>
            <TabsContent value="ajustes">
              {d.adjustments.length ? (
                <div className="space-y-2">
                  {d.adjustments.map((a) => (
                    <div key={a.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{adjustmentTypeLabel(a.adjustment_type)} {formatMoney(a.amount)}</strong>
                        <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                      </div>
                      <p>{a.reason}</p>
                      <p className="text-xs text-muted-foreground">Por {a.created_by}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Nenhum ajuste comercial" />
              )}
            </TabsContent>
            <TabsContent value="consolidado">
              <div className="space-y-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Por SKU</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {d.by_sku?.length ? (
                      <ul className="space-y-1 text-sm">
                        {d.by_sku.map((r) => (
                          <li key={r.sku} className="flex justify-between gap-3 border-b py-1">
                            <span>
                              {r.sku} · {r.product_name}
                            </span>
                            <span>
                              {r.items} linhas · {formatNumber(r.units)} un. ·{" "}
                              {formatMoney(r.billable)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title="Sem dados" />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Por marketplace</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {d.by_marketplace?.length ? (
                      <ul className="space-y-1 text-sm">
                        {d.by_marketplace.map((r) => (
                          <li key={r.marketplace} className="flex justify-between gap-3 border-b py-1">
                            <span>{r.marketplace}</span>
                            <span>
                              {r.items} linhas · {formatNumber(r.units)} un. ·{" "}
                              {formatMoney(r.billable)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title="Sem dados" />
                    )}
                  </CardContent>
                </Card>
                {d.snapshot?.totals ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Snapshot do fechamento</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1 text-sm">
                        {[
                          ["Vendas", String(d.snapshot.totals.sales ?? 0)],
                          ["Unidades", formatNumber(d.snapshot.totals.units ?? 0)],
                          ["Gross", formatMoney(d.snapshot.totals.gross ?? 0)],
                          ["Cobrável de itens", formatMoney(d.snapshot.totals.billable_items ?? 0)],
                          ["Ajustes", formatMoney(d.snapshot.totals.adjustments ?? 0)],
                          ["Cobrável líquido", formatMoney(d.snapshot.totals.net_billable ?? 0)],
                        ].map(([l, v]) => (
                          <li key={l} className="flex justify-between border-b py-1">
                            <span>{l}</span>
                            <strong>{v}</strong>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
          {dialog === "close" ? (
            <CloseReconciliationDialog
              organizationId={org}
              reconciliationId={id}
              onClose={() => setDialog(null)}
              onSaved={() => {
                setDialog(null);
                invalidate();
              }}
            />
          ) : null}
          {dialog === "reopen" ? (
            <ReopenDialog
              organizationId={org}
              reconciliationId={id}
              onClose={() => setDialog(null)}
              onSaved={() => {
                setDialog(null);
                invalidate();
              }}
            />
          ) : null}
          {dialog === "cancel" ? (
            <CancelReconciliationDialog
              organizationId={org}
              reconciliationId={id}
              onClose={() => setDialog(null)}
              onSaved={() => {
                setDialog(null);
                invalidate();
              }}
            />
          ) : null}
          {dialog === "adjust" ? (
            <AdjustmentDialog
              organizationId={org}
              reconciliationId={id}
              onClose={() => setDialog(null)}
              onSaved={() => {
                setDialog(null);
                invalidate();
              }}
            />
          ) : null}
          {reverseItem ? (
            <ReverseItemDialog
              organizationId={org}
              itemId={reverseItem.id}
              onClose={() => setReverseItem(null)}
              onSaved={() => {
                setReverseItem(null);
                invalidate();
              }}
            />
          ) : null}
          {exception ? (
            <ResolveExceptionDialog
              organizationId={org}
              exception={exception}
              onClose={() => setException(null)}
              onSaved={() => {
                setException(null);
                invalidate();
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

export function ExceptionsPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const qc = useQueryClient();
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReconciliationException | null>(null);
  const filters = { severity, status };
  useEffect(() => setPage(1), [org, severity, status]);
  const q = useQuery({
    queryKey: ["reconciliation", "exceptions", org, filters, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "exceptions", filters, page },
      })) as ReconciliationException[],
    enabled: Boolean(org && hasPermission("partner_reconciliation.read")),
  });
  return (
    <AppShell title="Reconciliação · Exceções">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission("partner_reconciliation.read") ? (
        <PermissionDenied permission="partner_reconciliation.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Central de exceções e divergências</h2>
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap gap-3">
                <select aria-label="Severidade" className={cls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="">Toda severidade</option>
                  {["INFO", "WARNING", "ERROR", "BLOCKING"].map((s) => (
                    <option key={s} value={s}>
                      {severityLabel(s)}
                    </option>
                  ))}
                </select>
                <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Todo status</option>
                  {["OPEN", "IN_REVIEW", "RESOLVED", "IGNORED_WITH_AUTHORIZATION"].map((s) => (
                    <option key={s} value={s}>
                      {exceptionStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              {q.isLoading ? (
                <LoadingState />
              ) : q.error ? (
                <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
              ) : !q.data?.length ? (
                <EmptyState title="Nenhuma exceção nos filtros" />
              ) : (
                <div className="space-y-2">
                  {(q.data as ReconciliationException[]).map((x) => (
                    <div key={x.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{exceptionTypeLabel(x.exception_type)}</strong>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={x.severity === "BLOCKING" ? "destructive" : x.severity === "ERROR" ? "destructive" : "secondary"}>
                            {severityLabel(x.severity)}
                          </Badge>
                          <Badge variant={x.status === "RESOLVED" ? "default" : "secondary"}>
                            {exceptionStatusLabel(x.status)}
                          </Badge>
                        </div>
                      </div>
                      <p>{x.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {x.partner_name ?? "Parceiro não identificado"} · {x.store_name ?? "Loja não identificada"} ·{" "}
                        {x.sku ?? ""} · {formatDateTime(x.created_at)}
                      </p>
                      {x.status !== "RESOLVED" && hasPermission("partner_reconciliation.resolve_exception") ? (
                        <div className="mt-2 print:hidden">
                          <Button variant="outline" size="sm" onClick={() => setSelected(x)}>
                            Resolver
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {selected ? (
            <ResolveExceptionDialog
              organizationId={org}
              exception={selected}
              onClose={() => setSelected(null)}
              onSaved={() => {
                setSelected(null);
                void q.refetch();
                void qc.invalidateQueries({ queryKey: ["reconciliation"] });
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}