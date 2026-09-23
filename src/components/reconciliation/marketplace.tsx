import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, EmptyState, ErrorState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/lib/org/org-context";
import {
  queryReconciliation,
  cancelMarketplaceSale,
} from "@/lib/reconciliation/reconciliation.functions";
import type {
  MarketplaceSaleList,
  MarketplaceSaleRow,
  MarketplaceStoreList,
  MarketplaceStoreRow,
  SkuMappingList,
  SkuMappingRow,
} from "@/lib/reconciliation/types";
import {
  formatMoney,
  formatDate,
  formatDateTime,
  saleStatusLabel,
  storeOwnershipLabel,
  storeStatusLabel,
} from "@/lib/reconciliation/constants";
import { RegisterSaleDialog, SaveStoreDialog, SaveMappingDialog } from "./dialogs";
import { Navigation } from "./pages";

const cls = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export function SalesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const cancel = useServerFn(cancelMarketplaceSale);
  const [query, setQuery] = useState("");
  const [store, setStore] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("partner_reconciliation.read");
  const stores = useQuery({
    queryKey: ["reconciliation", "stores", org],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "stores", filters: {}, page: 1 },
      })) as MarketplaceStoreList,
    enabled: Boolean(org && canRead),
  });
  const filters = { query, store, status, from, to };
  useEffect(() => setPage(1), [org, query, store, status, from, to]);
  const q = useQuery({
    queryKey: ["reconciliation", "sales", org, filters, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "sales", filters, page },
      })) as MarketplaceSaleList,
    enabled: Boolean(org && canRead),
  });
  const cancelMutation = useMutation({
    mutationFn: (saleId: string) =>
      cancel({ data: { organizationId: org!, saleId, reason: "Cancelamento manual" } }),
    onSuccess: () => {
      toast.success("Venda cancelada");
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AppShell title="Reconciliação · Vendas">
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
            <h2 className="font-heading text-xl font-semibold">Vendas do marketplace</h2>
            {hasPermission("partner_reconciliation.review") ? (
              <Button onClick={() => setOpen(true)}>Registrar venda</Button>
            ) : null}
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap gap-3">
                <Input
                  className="min-w-48 flex-1"
                  placeholder="Pedido, SKU externo ou parceiro"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Loja"
                  className={cls}
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                >
                  <option value="">Todas as lojas</option>
                  {(stores.data?.rows ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Status"
                  className={cls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Todo status</option>
                  {["IMPORTED", "VALIDATED", "RECONCILED", "CANCELED", "EXCEPTION"].map((s) => (
                    <option key={s} value={s}>
                      {saleStatusLabel(s)}
                    </option>
                  ))}
                </select>
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
              </div>
              {q.isLoading ? (
                <LoadingState />
              ) : q.error ? (
                <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
              ) : !q.data?.rows.length ? (
                <EmptyState
                  title="Nenhuma venda"
                  description="As vendas importadas do marketplace aparecem aqui até serem incluídas em um período."
                />
              ) : (
                <div className="space-y-2">
                  {(q.data.rows as MarketplaceSaleRow[]).map((s) => (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>
                          {s.external_order_id} · {s.external_sku}
                        </strong>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{saleStatusLabel(s.status)}</Badge>
                          {s.sku ? <Badge variant="outline">mapeado</Badge> : null}
                          {s.partner_name ? (
                            <span className="text-xs text-muted-foreground">{s.partner_name}</span>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-sm">
                        {s.store_name} ({s.marketplace}) · {formatDate(s.sale_date)} ·{" "}
                        {formatDate(s.created_at)} · {formatMoney(s.gross_amount)} gross
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.quantity} un. · frete {formatMoney(s.shipping_fee)} · desconto{" "}
                        {formatMoney(s.discount_amount)} · taxa {formatMoney(s.platform_fee)} ·
                        origem {s.source}
                      </p>
                      {["IMPORTED", "VALIDATED", "EXCEPTION"].includes(s.status) &&
                      hasPermission("partner_reconciliation.review") ? (
                        <div className="mt-2 print:hidden">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(s.id)}
                          >
                            Cancelar venda
                          </Button>
                        </div>
                      ) : null}
                    </div>
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
          {open && hasPermission("partner_reconciliation.review") ? (
            <RegisterSaleDialog
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

export function StoresPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("partner_reconciliation.read");
  const filters = { query };
  useEffect(() => setPage(1), [org, query]);
  const q = useQuery({
    queryKey: ["reconciliation", "stores", org, filters, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "stores", filters, page },
      })) as MarketplaceStoreList,
    enabled: Boolean(org && canRead),
  });
  return (
    <AppShell title="Reconciliação · Lojas">
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
            <h2 className="font-heading text-xl font-semibold">Lojas de marketplace</h2>
            {hasPermission("partner_reconciliation.create") ? (
              <Button onClick={() => setOpen(true)}>Nova loja</Button>
            ) : null}
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Input
                className="max-w-sm"
                placeholder="Código, nome, marketplace ou parceiro"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {q.isLoading ? (
                <LoadingState />
              ) : q.error ? (
                <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
              ) : !q.data?.rows.length ? (
                <EmptyState title="Nenhuma loja cadastrada" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(q.data.rows as MarketplaceStoreRow[]).map((s) => (
                    <div key={s.id} className="space-y-1 rounded-lg border p-4">
                      <div className="flex justify-between gap-3">
                        <strong>
                          {s.code} · {s.name}
                        </strong>
                        <Badge>{storeStatusLabel(s.status)}</Badge>
                      </div>
                      <p>
                        {s.marketplace}
                        {s.marketplace_store_id ? ` · ID ${s.marketplace_store_id}` : ""} ·{" "}
                        {storeOwnershipLabel(s.ownership_type)}
                      </p>
                      <p>{s.partner_name ?? "Sem parceiro vinculado"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(s.created_at)}
                      </p>
                    </div>
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
          {open && hasPermission("partner_reconciliation.create") ? (
            <SaveStoreDialog
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

export function SkuMappingsPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("partner_reconciliation.read");
  const filters = { query };
  useEffect(() => setPage(1), [org, query]);
  const q = useQuery({
    queryKey: ["reconciliation", "mappings", org, filters, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "mappings", filters, page },
      })) as SkuMappingList,
    enabled: Boolean(org && canRead),
  });
  return (
    <AppShell title="Reconciliação · Mapeamento SKU">
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
            <h2 className="font-heading text-xl font-semibold">Mapeamento de SKU externo</h2>
            {hasPermission("partner_reconciliation.create") ? (
              <Button onClick={() => setOpen(true)}>Novo mapeamento</Button>
            ) : null}
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Input
                className="max-w-sm"
                placeholder="SKU externo ou SKU interno"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {q.isLoading ? (
                <LoadingState />
              ) : q.error ? (
                <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
              ) : !q.data?.rows.length ? (
                <EmptyState
                  title="Nenhum mapeamento"
                  description="SKUs sem mapeamento geram exceção SKU_NOT_MAPPED na reconciliação."
                />
              ) : (
                <div className="space-y-2">
                  {(q.data.rows as SkuMappingRow[]).map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div>
                        <strong>{m.external_sku}</strong>
                        <p className="text-sm text-muted-foreground">
                          → {m.sku} · por {m.store_name ?? "todas as lojas"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(m.created_at)}
                      </span>
                    </div>
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
          {open && hasPermission("partner_reconciliation.create") ? (
            <SaveMappingDialog
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
