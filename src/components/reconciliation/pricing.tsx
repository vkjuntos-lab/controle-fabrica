import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, EmptyState, ErrorState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/lib/org/org-context";
import { queryReconciliation } from "@/lib/reconciliation/reconciliation.functions";
import type { PriceTableDetail, PriceTableList, PriceTableRow } from "@/lib/reconciliation/types";
import {
  formatMoney,
  formatDate,
  priceTableStatusLabel,
  priceItemStatusLabel,
} from "@/lib/reconciliation/constants";
import { PriceTableDialog, PriceItemDialog, LinkPriceDialog } from "./dialogs";
import { Navigation } from "./pages";

const cls = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const href = (id: string) => `/reconciliacao/tabelas-preco/${id}`;

export function PriceTablesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const canRead = hasPermission("partner_pricing.read");
  const filters = { query, status };
  useEffect(() => setPage(1), [org, query, status]);
  const q = useQuery({
    queryKey: ["reconciliation", "price_tables", org, filters, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "price_tables", filters, page },
      })) as PriceTableList,
    enabled: Boolean(org && canRead),
  });
  return (
    <AppShell title="Reconciliação · Tabelas de preço">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="partner_pricing.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Tabelas de preço comercial</h2>
            <div className="flex gap-2">
              {hasPermission("partner_pricing.manage") ? (
                <Button variant="outline" onClick={() => setLinkOpen(true)}>
                  Vincular parceiro
                </Button>
              ) : null}
              {hasPermission("partner_pricing.manage") ? (
                <Button onClick={() => setOpen(true)}>Nova tabela</Button>
              ) : null}
            </div>
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap gap-3">
                <Input
                  className="min-w-48 flex-1"
                  placeholder="Código, nome ou observação"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Toda situação</option>
                  {["ACTIVE", "INACTIVE"].map((s) => (
                    <option key={s} value={s}>
                      {priceTableStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              {q.isLoading ? (
                <LoadingState />
              ) : q.error ? (
                <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
              ) : !q.data?.rows.length ? (
                <EmptyState
                  title="Nenhuma tabela de preço"
                  description="Crie a primeira tabela para definir o valor cobrável dos parceiros."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(q.data.rows as PriceTableRow[]).map((t) => (
                    <a key={t.id} href={href(t.id)} className="space-y-2 rounded-lg border p-4 hover:bg-muted">
                      <div className="flex justify-between gap-3">
                        <strong>
                          {t.code} · {t.name}
                        </strong>
                        <Badge>{priceTableStatusLabel(t.status)}</Badge>
                      </div>
                      <p>
                        Vigência: {formatDate(t.valid_from)} a {formatDate(t.valid_to)}
                      </p>
                      <p>
                        {t.items_count} itens · {t.partners_count} parceiros vinculados
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
          {open && hasPermission("partner_pricing.manage") ? (
            <PriceTableDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                void q.refetch();
              }}
            />
          ) : null}
          {linkOpen && hasPermission("partner_pricing.manage") ? (
            <LinkPriceDialog
              organizationId={org}
              onClose={() => setLinkOpen(false)}
              onSaved={() => {
                setLinkOpen(false);
                void q.refetch();
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

export function PriceTableDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReconciliation);
  const [itemOpen, setItemOpen] = useState(false);
  const canRead = hasPermission("partner_pricing.read");
  const q = useQuery({
    queryKey: ["reconciliation", "price_table", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "price_table", filters: { id }, page: 1 },
      })) as PriceTableDetail,
    enabled: Boolean(org && canRead),
  });
  const d = q.data;
  return (
    <AppShell title="Tabela de preço">
      <Navigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="partner_pricing.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <EmptyState title="Tabela não encontrada" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-heading text-xl font-semibold">
                {d.code} · {d.name}
              </p>
              <p>
                Vigência: {formatDate(d.valid_from)} a {formatDate(d.valid_to)} ·{" "}
                <Badge>{priceTableStatusLabel(d.status)}</Badge>
              </p>
              {d.notes ? <p className="text-sm text-muted-foreground">{d.notes}</p> : null}
            </div>
            {hasPermission("partner_pricing.manage") ? (
              <Button onClick={() => setItemOpen(true)}>Adicionar preço</Button>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm">
            <p>
              <strong>{d.items.length}</strong> itens · <strong>{d.partners.length}</strong>{" "}
              parceiros vinculados
            </p>
          </div>
          <h3 className="font-semibold">Preços unitários</h3>
          {d.items.length ? (
            <div className="space-y-2">
              {d.items.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <strong>
                      {i.sku} · {i.product_name}
                    </strong>
                    <p className="text-sm text-muted-foreground">
                      vigência {formatDate(i.valid_from)} a {formatDate(i.valid_to)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={i.status === "ACTIVE" ? "default" : "outline"}>
                      {priceItemStatusLabel(i.status)}
                    </Badge>
                    <strong>{formatMoney(i.unit_price)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhum preço cadastrado nesta tabela" />
          )}
          <h3 className="font-semibold">Parceiros vinculados</h3>
          {d.partners.length ? (
            <div className="space-y-2">
              {d.partners.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <strong>{p.partner_name}</strong>
                  <span className="text-xs text-muted-foreground">
                    vigência {formatDate(p.valid_from)} a {formatDate(p.valid_to)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhum parceiro vinculado ainda" />
          )}
          {itemOpen && hasPermission("partner_pricing.manage") ? (
            <PriceItemDialog
              organizationId={org}
              priceTableId={id}
              onClose={() => setItemOpen(false)}
              onSaved={() => {
                setItemOpen(false);
                void q.refetch();
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}