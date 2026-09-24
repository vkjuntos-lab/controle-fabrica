import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, EmptyState, ErrorState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { BarcodeInput } from "@/components/inventory/barcode-input";
import { MovementDialog } from "@/components/inventory/movement-dialog";
import { useOrganization } from "@/lib/org/org-context";
import {
  queryPartners,
  actOnShipment,
  receivePartnerReturn,
} from "@/lib/partners/partners.functions";
import { listInventoryLocations } from "@/lib/inventory/inventory.functions";
import { createInventoryCount } from "@/lib/inventory/inventory.functions";
import { listCategories } from "@/lib/products/products.functions";
import { queryReconciliation } from "@/lib/reconciliation/reconciliation.functions";
import type {
  MarketplaceSaleList,
  MarketplaceStoreList,
  ReconciliationList,
  MarketplaceSaleRow,
  MarketplaceStoreRow,
  ReconciliationRow,
} from "@/lib/reconciliation/types";
import {
  formatMoney,
  formatNumber,
  formatDate,
  formatDateTime,
  reconciliationStatusLabel,
  saleStatusLabel,
  storeOwnershipLabel,
  storeStatusLabel,
} from "@/lib/reconciliation/constants";
import type {
  CompanyRow,
  PartnerDetail,
  PartnerList,
  OperationRow,
  OperationDetail,
  PositionList,
  PartnerSummary,
  DetailValues,
  History,
} from "@/lib/partners/types";
import { statusLabel } from "@/lib/partners/types";
import { exportPartnerCsv } from "@/lib/partners/export";
import { CompanyForm, ContactAddressForm } from "./company-form";
import { OperationForm } from "./operation-form";
import { PartnerReport, PartnerMovementHistory } from "./reports";
const cls = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const date = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");
const href = (kind: string, id: string) =>
  `/parceiros/${kind === "companies" ? "empresas" : kind === "shipments" ? "remessas" : "devolucoes"}/${id}`;
function Navigation() {
  return (
    <nav className="flex flex-wrap gap-2 print:hidden">
      {[
        ["/parceiros", "Empresas"],
        ["/parceiros/remessas", "Remessas"],
        ["/parceiros/devolucoes", "Devoluções"],
        ["/parceiros/estoque", "Estoque em terceiros"],
      ].map(([to, label]) => (
        <Button key={to} variant="outline" asChild>
          <a href={to}>{label}</a>
        </Button>
      ))}
    </nav>
  );
}
function HistoryList({ history }: { history: History[] }) {
  return history.length ? (
    <div className="space-y-2">
      {history.map((h, i) => (
        <div key={i} className="rounded border p-3">
          <p>{h.action}</p>
          <p className="text-xs text-muted-foreground">
            {date(h.created_at)} · {h.user_id}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState title="Nenhum evento registrado" />
  );
}
function Summary({ organizationId }: { organizationId: string }) {
  const fetch = useServerFn(queryPartners);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const q = useQuery({
    queryKey: ["partners", "summary", organizationId, from, to],
    queryFn: async () =>
      (await fetch({
        data: { organizationId, kind: "dashboard", filters: { from, to } },
      })) as PartnerSummary,
    enabled: Boolean(from && to && from <= to),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operação de parceiros</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label>
            De
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Até
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {q.isLoading ? (
          <LoadingState rows={2} />
        ) : q.error ? (
          <ErrorState description={q.error.message} />
        ) : q.data ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Parceiros ativos", q.data.active_partners],
              ["Unidades em poder (atual)", q.data.on_hand],
              ["Remessas no período", q.data.shipments],
              ["Unidades enviadas", q.data.sent],
              ["Unidades devolvidas", q.data.returned],
              ["Remessas pendentes", q.data.pending],
              ["Divergências abertas", q.data.discrepancies],
            ].map(([label, value]) => (
              <div key={label} className="rounded border p-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>Selecione um período válido.</p>
        )}
      </CardContent>
    </Card>
  );
}
export function PartnerListPage({
  kind = "companies",
}: {
  kind?: "companies" | "shipments" | "returns";
}) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryPartners);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const permission =
    kind === "companies"
      ? "partners.read"
      : kind === "shipments"
        ? "partner_shipments.read"
        : "partner_returns.read";
  const canRead = hasPermission(permission);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const locationsFn = useServerFn(listInventoryLocations);
  const sources = useQuery({
    queryKey: ["inventory-locations", org, "all"],
    queryFn: () => locationsFn({ data: { organizationId: org! } }),
    enabled: Boolean(org && kind !== "companies" && hasPermission("inventory.read")),
  });
  const partners = useQuery({
    queryKey: ["partners", "filter-options", org, partnerSearch],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "companies", filters: { query: partnerSearch } },
      })) as PartnerList,
    enabled: Boolean(org && kind !== "companies" && hasPermission("partners.read")),
  });
  const filters = {
    query,
    status,
    from,
    to,
    partner_id: partnerFilter,
    source_location_id: sourceFilter,
  };
  useEffect(() => setPage(1), [org, query, status, from, to, partnerFilter, sourceFilter]);
  const q = useQuery({
    queryKey: ["partners", kind, org, filters, page],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind, filters, page } })) as PartnerList,
    enabled: Boolean(org && canRead),
  });
  const title =
    kind === "companies" ? "Empresas parceiras" : kind === "shipments" ? "Remessas" : "Devoluções";
  async function exportRows() {
    if (!org) return;
    setExporting(true);
    try {
      const rows: Record<string, unknown>[] = [];
      let n = 1;
      while (true) {
        const data = (await fetch({
          data: { organizationId: org, kind, filters, page: n },
        })) as PartnerList;
        rows.push(...data.rows.map((r) => ({ ...r })));
        if (n * 50 >= data.total) break;
        n++;
      }
      exportPartnerCsv(`${kind}.csv`, rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <AppShell title={`Parceiros · ${title}`}>
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission={permission} />
      ) : (
        <>
          {kind === "companies" &&
          hasPermission("partner_inventory.read") &&
          hasPermission("partner_shipments.read") &&
          hasPermission("partner_returns.read") ? (
            <Summary organizationId={org} />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">{title}</h2>
            {hasPermission(
              kind === "companies"
                ? "partners.create"
                : kind === "shipments"
                  ? "partner_shipments.create"
                  : "partner_returns.create",
            ) ? (
              <Button onClick={() => setOpen(true)}>
                {kind === "companies"
                  ? "Nova empresa"
                  : kind === "shipments"
                    ? "Nova remessa"
                    : "Nova devolução"}
              </Button>
            ) : null}
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap gap-3">
                <Input
                  className="min-w-48 flex-1"
                  placeholder={
                    kind === "companies"
                      ? "Código, empresa ou documento"
                      : "Número, parceiro, produto ou SKU"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Status"
                  className={cls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Todos os status</option>
                  {(kind === "companies"
                    ? ["ACTIVE", "INACTIVE", "BLOCKED"]
                    : kind === "shipments"
                      ? [
                          "DRAFT",
                          "APPROVED",
                          "PICKING",
                          "SHIPPED",
                          "DELIVERED",
                          "PARTIALLY_RETURNED",
                          "RETURNED",
                          "CANCELED",
                        ]
                      : ["DRAFT", "RECEIVED", "CANCELED"]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
                {kind !== "companies" ? (
                  <>
                    <Input
                      aria-label="De"
                      type="date"
                      className="w-auto"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                    <Input
                      aria-label="Até"
                      type="date"
                      className="w-auto"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </>
                ) : null}
                <Button
                  variant="outline"
                  disabled={exporting || !q.data?.rows.length}
                  onClick={() => void exportRows()}
                >
                  {exporting ? "Exportando..." : "CSV filtrado"}
                </Button>
              </div>
              {kind !== "companies" ? (
                <div className="flex flex-wrap gap-3">
                  {hasPermission("partners.read") ? (
                    <>
                      <Input
                        className="w-56"
                        placeholder="Buscar parceiro para filtrar"
                        value={partnerSearch}
                        onChange={(e) => setPartnerSearch(e.target.value)}
                      />
                      <select
                        aria-label="Filtrar parceiro"
                        className={cls}
                        value={partnerFilter}
                        onChange={(e) => setPartnerFilter(e.target.value)}
                      >
                        <option value="">Todos os parceiros</option>
                        {((partners.data?.rows ?? []) as CompanyRow[])
                          .filter((c) => c.partner_id)
                          .map((c) => (
                            <option key={c.id} value={c.partner_id!}>
                              {c.legal_name}
                            </option>
                          ))}
                      </select>
                    </>
                  ) : null}
                  {hasPermission("inventory.read") ? (
                    <select
                      aria-label="Filtrar origem"
                      className={cls}
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                    >
                      <option value="">Todas as origens</option>
                      {sources.data?.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {partners.error || sources.error ? (
                    <p role="alert" className="text-destructive">
                      {partners.error?.message ?? sources.error?.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {q.isLoading ? (
                <LoadingState />
              ) : q.error ? (
                <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
              ) : !q.data?.rows.length ? (
                <EmptyState
                  title="Nenhum resultado"
                  description="Revise os filtros ou crie o primeiro cadastro."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {kind === "companies"
                    ? (q.data.rows as CompanyRow[]).map((c) => (
                        <a
                          key={c.id}
                          href={href(kind, c.id)}
                          className="space-y-2 rounded-lg border p-4 hover:bg-muted"
                        >
                          <div className="flex justify-between gap-3">
                            <strong>
                              {c.code} · {c.legal_name}
                            </strong>
                            <Badge>{statusLabel(c.status)}</Badge>
                          </div>
                          <p>
                            {c.document_number ?? "Sem documento"} ·{" "}
                            {c.city ?? "Endereço não cadastrado"}
                          </p>
                          <p>Estoque em poder: {c.on_hand ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            Lojas marketplace e reconciliação: aba Marketplaces no Partner 360º
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Última movimentação: {date(c.last_movement_at)}
                          </p>
                        </a>
                      ))
                    : (q.data.rows as OperationRow[]).map((r) => (
                        <a
                          key={r.id}
                          href={href(kind, r.id)}
                          className="space-y-2 rounded-lg border p-4 hover:bg-muted"
                        >
                          <p className="break-all font-mono text-sm">{r.number}</p>
                          <div className="flex justify-between">
                            <strong>{r.partner_name}</strong>
                            <Badge>{statusLabel(r.status)}</Badge>
                          </div>
                          <p>
                            {r.item_count} itens/SKUs · {r.units} unidades
                          </p>
                          <p>
                            {r.source_name} → {r.destination_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {date(r.date)} · Responsável: {r.created_by}
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
                  <Button
                    disabled={page * 50 >= q.data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {kind !== "companies" ? (
            <PartnerReport organizationId={org} kind={kind} filters={filters} />
          ) : null}
          {open ? (
            kind === "companies" ? (
              <CompanyForm
                organizationId={org}
                onClose={() => setOpen(false)}
                onSaved={(id) => window.location.assign(href(kind, id))}
              />
            ) : (
              <OperationForm
                organizationId={org}
                kind={kind === "shipments" ? "shipment" : "return"}
                onClose={() => setOpen(false)}
                onSaved={(id) => window.location.assign(href(kind, id))}
              />
            )
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function PartnerStoresTab({
  organizationId,
  partnerId,
}: {
  organizationId: string;
  partnerId: string;
}) {
  const { hasPermission } = useOrganization();
  const fetch = useServerFn(queryReconciliation);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [organizationId, partnerId]);
  const q = useQuery({
    queryKey: ["reconciliation", "stores", organizationId, "partner", partnerId, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId, kind: "stores", filters: { partner_id: partnerId }, page },
      })) as MarketplaceStoreList,
    enabled: Boolean(organizationId && hasPermission("reconciliation.read")),
  });
  if (!hasPermission("reconciliation.read"))
    return <PermissionDenied permission="reconciliation.read" />;
  return (
    <div className="space-y-2">
      {q.isLoading ? <LoadingState rows={2} /> : null}
      {q.error ? <ErrorState description={q.error.message} /> : null}
      {q.data && !q.data.rows.length ? (
        <EmptyState
          title="Nenhuma loja vinculada"
          description="Vincule lojas a este parceiro no módulo de Reconciliação."
        />
      ) : null}
      {(q.data?.rows as MarketplaceStoreRow[] | undefined)?.map((s) => (
        <div key={s.id} className="space-y-1 rounded-lg border p-3">
          <div className="flex justify-between gap-3">
            <strong>
              {s.code} · {s.name}
            </strong>
            <Badge>{storeStatusLabel(s.status)}</Badge>
          </div>
          <p>
            {s.marketplace} · {storeOwnershipLabel(s.ownership_type)}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
        </div>
      ))}
      {q.data && q.data.total > 50 ? (
        <div className="flex justify-between">
          <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span>Página {page}</span>
          <Button disabled={page * 50 >= q.data.total} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PartnerSalesTab({
  organizationId,
  partnerId,
}: {
  organizationId: string;
  partnerId: string;
}) {
  const { hasPermission } = useOrganization();
  const fetch = useServerFn(queryReconciliation);
  const q = useQuery({
    queryKey: ["reconciliation", "sales", organizationId, "partner", partnerId],
    queryFn: async () =>
      (await fetch({
        data: { organizationId, kind: "sales", filters: { partner_id: partnerId }, page: 1 },
      })) as MarketplaceSaleList,
    enabled: Boolean(organizationId && hasPermission("reconciliation.read")),
  });
  return (
    <div className="space-y-2">
      {q.isLoading ? <LoadingState rows={2} /> : null}
      {q.error ? <ErrorState description={q.error.message} /> : null}
      {q.data && !q.data.rows.length ? (
        <EmptyState
          title="Nenhuma venda no marketplace"
          description="Vendas importadas dos marketplaces deste parceiro aparecem aqui."
        />
      ) : null}
      {(q.data?.rows as MarketplaceSaleRow[] | undefined)?.map((s) => (
        <div key={s.id} className="space-y-1 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>
              {s.external_order_id} · {s.external_sku}
            </strong>
            <Badge>{saleStatusLabel(s.status)}</Badge>
          </div>
          <p className="text-sm">
            {s.store_name} ({s.marketplace}) · {formatDate(s.sale_date)} ·{" "}
            {formatMoney(s.gross_amount)}
          </p>
          <p className="text-xs text-muted-foreground">{formatNumber(s.quantity)} unidades</p>
        </div>
      ))}
    </div>
  );
}

function PartnerReconciliationsTab({
  organizationId,
  partnerId,
  closed,
}: {
  organizationId: string;
  partnerId: string;
  closed: boolean;
}) {
  const { hasPermission } = useOrganization();
  const fetch = useServerFn(queryReconciliation);
  const filters = closed ? { partner_id: partnerId, status: "CLOSED" } : { partner_id: partnerId };
  const q = useQuery({
    queryKey: ["reconciliation", "reconciliations", organizationId, "partner", partnerId, closed],
    queryFn: async () =>
      (await fetch({
        data: { organizationId, kind: "reconciliations", filters, page: 1 },
      })) as ReconciliationList,
    enabled: Boolean(organizationId && hasPermission("reconciliation.read")),
  });
  return (
    <div className="space-y-2">
      {q.isLoading ? <LoadingState rows={2} /> : null}
      {q.error ? <ErrorState description={q.error.message} /> : null}
      {q.data && !q.data.rows.length ? (
        <EmptyState
          title={closed ? "Nenhum fechamento concluído" : "Nenhuma reconciliação"}
          description={
            closed
              ? "Os períodos fechados com este parceiro aparecem aqui."
              : "Crie um período de reconciliação para este parceiro."
          }
        />
      ) : null}
      {(q.data?.rows as ReconciliationRow[] | undefined)?.map((r) => (
        <div key={r.id} className="space-y-1 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>
              {formatDate(r.period_start)} a {formatDate(r.period_end)}
            </strong>
            <Badge>{reconciliationStatusLabel(r.status)}</Badge>
          </div>
          <p className="text-sm">
            {r.sales_count} vendas · {formatNumber(r.units_sold)} un. · cobrável{" "}
            {formatMoney(r.billable_amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {r.status === "CLOSED" && r.closed_at
              ? `Fechado em ${formatDateTime(r.closed_at)}`
              : `Criado em ${formatDateTime(r.created_at)}`}
          </p>
        </div>
      ))}
      {q.data && q.data.total > 50 ? (
        <p className="text-xs text-muted-foreground">
          Exibindo as primeiras 50 de {q.data.total} — use o módulo de Reconciliação para listar com
          filtros.
        </p>
      ) : null}
    </div>
  );
}
export function PartnerPositions({
  organizationId,
  partnerId,
}: {
  organizationId: string;
  partnerId?: string;
}) {
  const fetch = useServerFn(queryPartners);
  const categoriesFn = useServerFn(listCategories);
  const { hasPermission } = useOrganization();
  const [query, setQuery] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const filters = { query, to, partner_id: partnerId ?? "", category_id: category };
  const categories = useQuery({
    queryKey: ["product-categories", organizationId],
    queryFn: () => categoriesFn({ data: { organizationId } }),
    enabled: hasPermission("products.read"),
  });
  const q = useQuery({
    queryKey: ["partners", "positions", organizationId, filters, page],
    queryFn: async () =>
      (await fetch({ data: { organizationId, kind: "positions", filters, page } })) as PositionList,
    enabled: hasPermission("partner_inventory.read"),
  });
  useEffect(() => setPage(1), [organizationId, query, to, category, partnerId]);
  async function exportRows() {
    setExporting(true);
    try {
      const rows: Record<string, unknown>[] = [];
      let n = 1;
      while (true) {
        const d = (await fetch({
          data: { organizationId, kind: "positions", filters, page: n },
        })) as PositionList;
        rows.push(...d.rows.map((r) => ({ ...r })));
        if (n * 50 >= d.total) break;
        n++;
      }
      exportPartnerCsv("posicao-parceiros.csv", rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  if (!hasPermission("partner_inventory.read"))
    return <PermissionDenied permission="partner_inventory.read" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          className="flex-1"
          placeholder="Parceiro, produto, SKU ou barcode"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          Posição até (UTC)
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select
          aria-label="Categoria"
          className={cls}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={exporting || !q.data?.rows.length}
          onClick={() => void exportRows()}
        >
          Exportar CSV
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Posse física derivada do Inventory Ledger. Enviado não significa vendido.
      </p>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Sem movimentos para os filtros" />
      ) : (
        <>
          <p className="font-semibold">
            {q.data.units} unidades em poder · {q.data.total} posições
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {q.data.rows.map((r) => (
              <div
                key={`${r.location_id}:${r.variant_id}`}
                className="space-y-1 rounded border p-3"
              >
                <p className="font-semibold">
                  {r.partner_name} · {r.product_name}
                </p>
                <p>
                  {r.sku} · {[r.size, r.color].filter(Boolean).join(" / ")}
                </p>
                <p>
                  Atual: <strong>{r.on_hand}</strong> · Enviado acumulado: {r.sent} · Devolvido:{" "}
                  {r.returned}
                </p>
                <p className="text-xs">
                  Última remessa: {date(r.last_shipment)} · Movimento: {date(r.last_movement_at)}
                </p>
              </div>
            ))}
          </div>
          {q.data.total > 50 ? (
            <div className="flex justify-between">
              <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span>{page}</span>
              <Button disabled={page * 50 >= q.data.total} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
export function PartnerInventoryPage() {
  const { currentOrganization, isLoading } = useOrganization();
  return (
    <AppShell title="Parceiros · Estoque em terceiros">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : currentOrganization ? (
        <PartnerPositions organizationId={currentOrganization.organization_id} />
      ) : (
        <EmptyState title="Selecione uma organização" />
      )}
    </AppShell>
  );
}
function PartnerOperations({
  organizationId,
  partnerId,
  kind,
}: {
  organizationId: string;
  partnerId: string;
  kind: "shipments" | "returns";
}) {
  const fetch = useServerFn(queryPartners);
  const { hasPermission } = useOrganization();
  const [page, setPage] = useState(1);
  const permission = kind === "shipments" ? "partner_shipments.read" : "partner_returns.read";
  const q = useQuery({
    queryKey: ["partners", kind, organizationId, partnerId, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId, kind, filters: { partner_id: partnerId }, page },
      })) as PartnerList,
    enabled: hasPermission(permission),
  });
  if (!hasPermission(permission)) return <PermissionDenied permission={permission} />;
  return q.isLoading ? (
    <LoadingState />
  ) : q.error ? (
    <ErrorState description={q.error.message} />
  ) : !q.data?.rows.length ? (
    <EmptyState title="Sem registros" />
  ) : (
    <div className="space-y-3">
      {(q.data.rows as OperationRow[]).map((r) => (
        <a key={r.id} href={href(kind, r.id)} className="block rounded border p-4">
          <p className="break-all">{r.number}</p>
          <p>
            {statusLabel(r.status)} · {r.item_count} itens · {r.units} unidades · {date(r.date)}
          </p>
        </a>
      ))}
      {q.data.total > 50 ? (
        <div className="flex justify-between">
          <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button disabled={page * 50 >= q.data.total} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      ) : null}
    </div>
  );
}
export function PartnerDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryPartners);
  const cache = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [detail, setDetail] = useState<{
    kind: "contact" | "address";
    record?: DetailValues;
  } | null>(null);
  const [operation, setOperation] = useState<"shipment" | "return" | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [confirmCount, setConfirmCount] = useState(false);
  const startCount = useServerFn(createInventoryCount);
  const q = useQuery({
    queryKey: ["partners", "company", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "company", filters: { id } },
      })) as PartnerDetail,
    enabled: Boolean(org && hasPermission("partners.read")),
  });
  const c = q.data;
  const count = useMutation({
    mutationFn: () =>
      startCount({
        data: { organizationId: org!, locationId: c!.profile!.default_inventory_location_id },
      }),
    onSuccess: (r) => window.location.assign(`/estoque/inventarios/${r.id}`),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AppShell title="Parceiro 360º">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission("partners.read") ? (
        <PermissionDenied permission="partners.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : c ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">
              {c.code} · {c.legal_name}
            </h2>
            <Badge>{statusLabel(c.status)}</Badge>
            {hasPermission("partners.update") ? (
              <Button variant="outline" onClick={() => setEdit(true)}>
                Editar empresa
              </Button>
            ) : null}
          </div>
          {c.blocked_reason && c.status === "BLOCKED" ? (
            <p className="rounded border border-destructive p-3 text-destructive">
              Bloqueado: {c.blocked_reason}
            </p>
          ) : null}
          <Tabs defaultValue="overview">
            <TabsList className="h-auto flex-wrap">
              {[
                ["overview", "Visão geral"],
                ["contacts", "Contatos"],
                ["addresses", "Endereços"],
                ["shipments", "Remessas"],
                ["inventory", "Estoque"],
                ["returns", "Devoluções"],
                ["stores", "Marketplaces"],
                ["sales", "Vendas"],
                ["reconciled", "Reconciliações"],
                ["closed", "Fechamentos"],
                ["history", "Histórico"],
              ].map(([v, l]) => (
                <TabsTrigger key={v} value={v}>
                  {l}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p>
                    {c.trade_name} · {c.document_type}: {c.document_number ?? "Não informado"}
                  </p>
                  <p>
                    {c.email} · {c.phone}
                  </p>
                  <p>Relações: {c.roles.join(", ")}</p>
                  <p>
                    Contato principal:{" "}
                    {String(c.contacts.find((x) => x.is_primary)?.name ?? "Não informado")}
                  </p>
                  <p>
                    Frequência prevista: {c.profile?.settlement_frequency ?? "—"} (sem fechamento
                    automático)
                  </p>
                  <p>Localização: {c.location_name ?? "Sem perfil de parceiro"}</p>
                  <p>
                    Quantidade em poder: {c.on_hand ?? "—"} · Última remessa:{" "}
                    {date(c.last_shipment)}
                  </p>
                  <p>{c.notes}</p>
                  <p className="text-sm text-muted-foreground">
                    Remessa não é venda e não gera contas a receber. A propriedade não muda
                    automaticamente pela posse.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            {(["contact", "address"] as const).map((kind) => (
              <TabsContent key={kind} value={kind === "contact" ? "contacts" : "addresses"}>
                <div className="space-y-3">
                  {hasPermission(
                    kind === "contact" ? "partner_contacts.manage" : "partner_addresses.manage",
                  ) ? (
                    <Button onClick={() => setDetail({ kind })}>
                      Adicionar {kind === "contact" ? "contato" : "endereço"}
                    </Button>
                  ) : null}
                  {(kind === "contact" ? c.contacts : c.addresses).length ? (
                    (kind === "contact" ? c.contacts : c.addresses).map((r) => (
                      <Card key={r.id}>
                        <CardContent className="space-y-2 pt-6">
                          {Object.entries(r)
                            .filter(
                              ([k, v]) =>
                                ![
                                  "id",
                                  "organization_id",
                                  "company_id",
                                  "created_at",
                                  "updated_at",
                                ].includes(k) &&
                                v != null &&
                                v !== "",
                            )
                            .map(([k, v]) => (
                              <p key={k} className="text-sm">
                                {{
                                  name: "Nome",
                                  title: "Cargo",
                                  email: "E-mail",
                                  phone: "Telefone",
                                  whatsapp: "WhatsApp",
                                  is_primary: "Principal",
                                  status: "Status",
                                  notes: "Observações",
                                  type: "Tipo",
                                  postal_code: "CEP",
                                  street: "Logradouro",
                                  number: "Número",
                                  complement: "Complemento",
                                  district: "Bairro",
                                  city: "Cidade",
                                  state: "UF",
                                  country: "País",
                                }[k] ?? k}
                                : {typeof v === "boolean" ? (v ? "Sim" : "Não") : v}
                              </p>
                            ))}
                          {hasPermission(
                            kind === "contact"
                              ? "partner_contacts.manage"
                              : "partner_addresses.manage",
                          ) ? (
                            <Button
                              variant="outline"
                              onClick={() => setDetail({ kind, record: r })}
                            >
                              Editar
                            </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <EmptyState title="Nenhum cadastro" />
                  )}
                </div>
              </TabsContent>
            ))}
            <TabsContent value="shipments">
              {c.profile ? (
                <div className="space-y-3">
                  {hasPermission("partner_shipments.create") && c.status === "ACTIVE" ? (
                    <Button onClick={() => setOperation("shipment")}>Nova remessa</Button>
                  ) : null}
                  <PartnerOperations
                    organizationId={org}
                    partnerId={c.profile.id}
                    kind="shipments"
                  />
                </div>
              ) : (
                <EmptyState title="Empresa sem perfil de parceiro" />
              )}
            </TabsContent>
            <TabsContent value="inventory">
              {c.profile ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {hasPermission("partner_inventory.adjust") &&
                    hasPermission("inventory.adjust") ? (
                      <Button variant="outline" onClick={() => setAdjust(true)}>
                        Ajustar com motivo
                      </Button>
                    ) : null}
                    {hasPermission("inventory.count") ? (
                      <Button variant="outline" onClick={() => setConfirmCount(true)}>
                        Iniciar contagem física
                      </Button>
                    ) : null}
                    <Button variant="outline" asChild>
                      <a href="/estoque/movimentacoes">Histórico do ledger</a>
                    </Button>
                  </div>
                  <PartnerPositions organizationId={org} partnerId={c.profile.id} />
                </div>
              ) : (
                <EmptyState title="Empresa sem localização de parceiro" />
              )}
            </TabsContent>
            <TabsContent value="returns">
              {c.profile ? (
                <div className="space-y-3">
                  {hasPermission("partner_returns.create") ? (
                    <Button onClick={() => setOperation("return")}>Nova devolução</Button>
                  ) : null}
                  <PartnerOperations organizationId={org} partnerId={c.profile.id} kind="returns" />
                </div>
              ) : (
                <EmptyState title="Empresa sem perfil de parceiro" />
              )}
            </TabsContent>
            <TabsContent value="stores">
              {c.profile ? (
                <PartnerStoresTab organizationId={org} partnerId={c.profile.id} />
              ) : (
                <EmptyState title="Empresa sem perfil de parceiro" />
              )}
            </TabsContent>
            <TabsContent value="sales">
              {c.profile ? (
                <PartnerSalesTab organizationId={org} partnerId={c.profile.id} />
              ) : (
                <EmptyState title="Empresa sem perfil de parceiro" />
              )}
            </TabsContent>
            <TabsContent value="reconciled">
              {c.profile ? (
                <PartnerReconciliationsTab
                  organizationId={org}
                  partnerId={c.profile.id}
                  closed={false}
                />
              ) : (
                <EmptyState title="Empresa sem perfil de parceiro" />
              )}
            </TabsContent>
            <TabsContent value="closed">
              {c.profile ? (
                <PartnerReconciliationsTab organizationId={org} partnerId={c.profile.id} closed />
              ) : (
                <EmptyState title="Empresa sem perfil de parceiro" />
              )}
            </TabsContent>
            <TabsContent value="history">
              <div className="space-y-6">
                <HistoryList history={c.history} />
                {c.profile && hasPermission("partner_inventory.read") ? (
                  <PartnerMovementHistory organizationId={org} partnerId={c.profile.id} />
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
          {edit ? (
            <CompanyForm
              organizationId={org}
              company={c}
              onClose={() => setEdit(false)}
              onSaved={() => {
                setEdit(false);
                void cache.invalidateQueries({ queryKey: ["partners"] });
              }}
            />
          ) : null}
          {detail ? (
            <ContactAddressForm
              organizationId={org}
              companyId={id}
              kind={detail.kind}
              record={detail.record}
              onClose={() => setDetail(null)}
            />
          ) : null}
          {operation && c.profile ? (
            <OperationForm
              organizationId={org}
              kind={operation}
              partner={{
                id: c.profile.id,
                name: c.legal_name,
                location: c.profile.default_inventory_location_id,
              }}
              onClose={() => setOperation(null)}
              onSaved={(op) =>
                window.location.assign(href(operation === "shipment" ? "shipments" : "returns", op))
              }
            />
          ) : null}
          {adjust && c.profile ? (
            <MovementDialog
              open
              onOpenChange={setAdjust}
              initialLocationId={c.profile.default_inventory_location_id}
              initialMovementType="ADJUSTMENT_IN"
            />
          ) : null}
          <AlertDialog open={confirmCount} onOpenChange={setConfirmCount}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Iniciar inventário físico?</AlertDialogTitle>
                <AlertDialogDescription>
                  A localização ficará bloqueada para remessas, devoluções e ajustes até concluir ou
                  cancelar a contagem. Divergências só geram ajustes após confirmação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction disabled={count.isPending} onClick={() => count.mutate()}>
                  Iniciar contagem
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </AppShell>
  );
}
export function PartnerOperationPage({ id, kind }: { id: string; kind: "shipment" | "return" }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryPartners);
  const act = useServerFn(actOnShipment);
  const receive = useServerFn(receivePartnerReturn);
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState<
    "approve" | "start_picking" | "ship" | "receive" | "cancel" | null
  >(null);
  const [receiver, setReceiver] = useState("");
  const [returned, setReturned] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const permission = kind === "shipment" ? "partner_shipments.read" : "partner_returns.read";
  const q = useQuery({
    queryKey: ["partners", kind, org, id],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind, filters: { id } } })) as OperationDetail,
    enabled: Boolean(org && hasPermission(permission)),
  });
  const op = q.data;
  const mutation = useMutation({
    mutationFn: async (action: {
      action: "approve" | "start_picking" | "pick" | "ship" | "receive" | "cancel";
      item_id?: string;
      quantity?: number;
    }) =>
      kind === "return"
        ? receive({ data: { organizationId: org!, id } })
        : act({
            data: {
              organizationId: org!,
              id,
              action: action.action,
              values: {
                item_id: action.item_id,
                quantity: action.quantity,
                received_by: receiver || undefined,
              },
            },
          }),
    onSuccess: (result) => {
      if (
        result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        typeof result.warning === "string"
      )
        toast.warning(result.warning);
      toast.success("Operação confirmada");
      setConfirm(null);
      setDrafts({});
      void cache.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "partners" || String(q.queryKey[0]).startsWith("inventory-"),
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const actions = op
    ? kind === "return"
      ? op.status === "DRAFT"
        ? [["receive", "Confirmar recebimento", "partner_returns.receive"]]
        : []
      : [
          ...(op.status === "DRAFT" ? [["approve", "Aprovar", "partner_shipments.approve"]] : []),
          ...(op.status === "APPROVED"
            ? [["start_picking", "Iniciar separação", "partner_shipments.pick"]]
            : []),
          ...(op.status === "PICKING"
            ? [["ship", "Confirmar expedição", "partner_shipments.ship"]]
            : []),
          ...(["SHIPPED", "PARTIALLY_RETURNED", "RETURNED"].includes(op.status) && !op.delivered_at
            ? [["receive", "Confirmar entrega", "partner_shipments.receive"]]
            : []),
          ...(["DRAFT", "PENDING_APPROVAL", "APPROVED", "PICKING"].includes(op.status)
            ? [["cancel", "Cancelar remessa", "partner_shipments.cancel"]]
            : []),
        ]
    : [];
  function print() {
    window.print();
  }
  return (
    <AppShell title={kind === "shipment" ? "Parceiros · Remessa" : "Parceiros · Devolução"}>
      <style>{`@media print { [data-sidebar="sidebar"], [data-side][data-collapsible], header { display:none !important; } main { margin:0 !important; padding:0 !important; } }`}</style>
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission(permission) ? (
        <PermissionDenied permission={permission} />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : op ? (
        <>
          <div className="space-y-2">
            <h1 className="hidden print:block">Romaneio de remessa</h1>
            <h2 className="break-all font-heading text-xl">{op.number}</h2>
            <p>
              <a className="underline" href={href("companies", op.company_id)}>
                {op.partner_name}
              </a>{" "}
              · <Badge>{statusLabel(op.status)}</Badge> · {date(op.shipment_date ?? op.return_date)}
            </p>
            <p>
              {op.source_name} → {op.destination_name}
            </p>
            <p>
              {new Set(op.items.map((i) => i.variant_id)).size} SKUs · {op.items.length} itens/lotes
              · {op.items.reduce((s, i) => s + i.quantity, 0)} unidades{" "}
              {kind === "shipment"
                ? `solicitadas · ${op.shipped_at ? op.items.reduce((s, i) => s + i.quantity, 0) : 0} enviadas · ${op.returned_units ?? 0} devolvidas`
                : "a devolver"}
            </p>
            <p>{op.notes}</p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {actions
              .filter(([, , p]) => hasPermission(p))
              .map(([action, label]) => (
                <Button
                  key={action}
                  disabled={mutation.isPending}
                  onClick={() => setConfirm(action as typeof confirm)}
                >
                  {label}
                </Button>
              ))}
            {kind === "shipment" ? (
              <Button variant="outline" onClick={print}>
                Imprimir romaneio
              </Button>
            ) : null}
            {kind === "shipment" &&
            op.shipped_at &&
            hasPermission("partner_returns.create") &&
            op.status !== "RETURNED" ? (
              <Button variant="outline" onClick={() => setReturned(true)}>
                Registrar devolução
              </Button>
            ) : null}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                {kind === "shipment" ? "Itens e separação" : "Itens devolvidos"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {kind === "shipment" &&
              op.status === "PICKING" &&
              hasPermission("partner_shipments.pick") ? (
                <div className="print:hidden">
                  <BarcodeInput
                    disabled={mutation.isPending}
                    onScan={(code) => {
                      const matches = op.items.filter((i) => i.barcode === code || i.sku === code);
                      if (matches.length !== 1) {
                        toast.error(
                          matches.length
                            ? "Vários lotes: confirme no item correspondente."
                            : "Código não pertence à remessa.",
                        );
                        return;
                      }
                      const i = matches[0];
                      mutation.mutate({
                        action: "pick",
                        item_id: i.id,
                        quantity: (i.picked_quantity ?? 0) + 1,
                      });
                    }}
                  />
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {op.items.map((i) => (
                  <div key={i.id} className="space-y-2 rounded border p-3">
                    <strong>{i.product_name}</strong>
                    <p>
                      {i.sku} · {[i.size, i.color, i.batch_code].filter(Boolean).join(" / ")}
                    </p>
                    <p>
                      Quantidade: {i.quantity}
                      {kind === "shipment"
                        ? ` · Separado: ${i.picked_quantity ?? 0} · Faltante: ${i.quantity - (i.picked_quantity ?? 0)}`
                        : ` · ${statusLabel(i.condition ?? "")}`}
                    </p>
                    {i.reason ? <p>Motivo: {i.reason}</p> : null}
                    {kind === "shipment" &&
                    op.status === "PICKING" &&
                    hasPermission("partner_shipments.pick") ? (
                      <div className="flex gap-2 print:hidden">
                        <Input
                          type="number"
                          aria-label={`Separado ${i.sku}`}
                          min="0"
                          max={i.quantity}
                          step="0.001"
                          inputMode="decimal"
                          value={drafts[i.id] ?? String(i.picked_quantity ?? 0)}
                          onChange={(e) => setDrafts((old) => ({ ...old, [i.id]: e.target.value }))}
                        />
                        <Button
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({
                              action: "pick",
                              item_id: i.id,
                              quantity: Number(drafts[i.id] ?? i.picked_quantity ?? 0),
                            })
                          }
                        >
                          Confirmar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Entrega e movimentações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>
                Expedição: {date(op.shipped_at)} · Recebimento:{" "}
                {date(op.delivered_at ?? op.received_at)} · Recebido por: {op.received_by ?? "—"}
              </p>
              <p>
                Transportadora: {op.carrier_name ?? "—"} · Rastreio: {op.tracking_code ?? "—"} ·
                Previsão: {date(op.expected_delivery_date)}
              </p>
              <p className="text-sm text-muted-foreground">
                O estoque muda na confirmação de expedição. A entrega não movimenta novamente.
                Devolução movimenta no recebimento.
              </p>
              {op.movements.length ? (
                op.movements.map((m) => (
                  <p key={m.id}>
                    <a className="underline" href={`/estoque/movimentacoes/${m.id}`}>
                      {m.direction} {m.quantity} · {m.id}
                    </a>
                  </p>
                ))
              ) : (
                <p>Nenhum movimento consolidado.</p>
              )}
              {op.returns?.map((r) => (
                <p key={r.id}>
                  <a className="underline" href={href("returns", r.id)}>
                    {r.return_number} · {statusLabel(r.status)}
                  </a>
                </p>
              ))}
            </CardContent>
          </Card>
          <div className="print:hidden">
            <h3 className="mb-3 font-semibold">Histórico operacional</h3>
            <HistoryList history={op.history} />
          </div>
          <p className="hidden print:block">
            Romaneio operacional — não é nota fiscal. Remessa não é venda.
          </p>
          {returned ? (
            <OperationForm
              organizationId={org}
              kind="return"
              shipmentId={id}
              partner={{
                id: op.partner_id,
                name: op.partner_name,
                location: op.destination_location_id,
              }}
              onClose={() => setReturned(false)}
              onSaved={(id) => window.location.assign(href("returns", id))}
            />
          ) : null}
          <AlertDialog
            open={Boolean(confirm)}
            onOpenChange={(v) => {
              if (!v) setConfirm(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar operação?</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirm === "ship"
                    ? "Expedir gera saída na origem e entrada no parceiro, de forma atômica. O saldo será revalidado agora."
                    : kind === "return"
                      ? "Receber a devolução gera saída no parceiro e entrada no destino informado. A remessa original será preservada."
                      : confirm === "receive"
                        ? "Registra quem recebeu a mercadoria. Não gera novo movimento de estoque."
                        : "A alteração ficará registrada no histórico operacional."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {confirm === "receive" && kind === "shipment" ? (
                <div>
                  <Label>Recebido por *</Label>
                  <Input value={receiver} onChange={(e) => setReceiver(e.target.value)} />
                </div>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={
                    mutation.isPending ||
                    (confirm === "receive" && kind === "shipment" && !receiver.trim())
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm) mutation.mutate({ action: confirm });
                  }}
                >
                  {mutation.isPending ? "Confirmando..." : "Confirmar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </AppShell>
  );
}
