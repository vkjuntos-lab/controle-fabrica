import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, PackageSearch, Plus, Warehouse } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { MovementDialog } from "@/components/inventory/movement-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatQuantity } from "@/lib/inventory/constants";
import {
  listInventoryLocations,
  listInventoryPositions,
  type InventoryPositionRow,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/")({
  head: () => ({
    meta: [
      { title: "Estoque — Estratégia" },
      {
        name: "description",
        content: "Posição de estoque por variante e localização, derivada do ledger.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InventoryPositionPage,
});

const PAGE_SIZE = 50;

function InventoryPositionPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;

  const fetchPositions = useServerFn(listInventoryPositions);
  const fetchLocations = useServerFn(listInventoryLocations);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [locationId, setLocationId] = useState("ALL");
  const [onlyBelowMinimum, setOnlyBelowMinimum] = useState(false);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seed, setSeed] = useState<{ variantId?: string; locationId?: string }>({});

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, locationId, onlyBelowMinimum]);

  const positionsQuery = useQuery({
    queryKey: [
      "inventory-positions",
      organizationId,
      deferredQuery,
      locationId,
      onlyBelowMinimum,
      page,
    ],
    queryFn: () =>
      fetchPositions({
        data: {
          organizationId: organizationId!,
          query: deferredQuery,
          locationId: locationId === "ALL" ? undefined : locationId,
          onlyBelowMinimum,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    enabled: Boolean(organizationId),
  });

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations", organizationId, "all"],
    queryFn: () => fetchLocations({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  const data = positionsQuery.data;
  const canMove =
    hasPermission(PERMISSIONS.inventoryMove) || hasPermission(PERMISSIONS.inventoryAdjust);

  function handleExport() {
    if (!data?.rows.length) {
      return;
    }
    const csv = toCsv(
      data.rows.map((row) => ({
        produto: row.product_name,
        codigo: row.product_code,
        sku: row.sku,
        tamanho: row.size ?? "",
        cor: row.color ?? "",
        localizacao: row.location_name,
        codigo_local: row.location_code,
        saldo: row.on_hand,
        minimo: row.minimum_stock,
        reposicao: row.reorder_point,
        abaixo_minimo: row.below_minimum ? "sim" : "nao",
        ultima_movimentacao: row.last_movement_at ?? "",
      })),
      [
        "produto",
        "codigo",
        "sku",
        "tamanho",
        "cor",
        "localizacao",
        "codigo_local",
        "saldo",
        "minimo",
        "reposicao",
        "abaixo_minimo",
        "ultima_movimentacao",
      ],
    );
    downloadCsv("estoque-posicao.csv", csv);
  }

  return (
    <AppShell title="Estoque · Posição">
      {orgLoading ? (
        <LoadingState rows={4} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.inventoryRead) ? (
        <PermissionDenied permission={PERMISSIONS.inventoryRead} />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-lg font-semibold">Posição de estoque</h2>
              <p className="text-sm text-muted-foreground">
                Saldo derivado do ledger de movimentos. Nenhuma edição direta: toda alteração é um
                novo movimento.
              </p>
            </div>
            {canMove ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSeed({});
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo movimento
                </Button>
              </div>
            ) : null}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Saldos por localização</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!data?.rows.length}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="position-search">Buscar</Label>
                  <Input
                    id="position-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Produto, SKU, tamanho, cor, local..."
                  />
                </div>
                <div className="space-y-2 sm:w-56">
                  <Label>Localização</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      {locationsQuery.data?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant={onlyBelowMinimum ? "default" : "outline"}
                  onClick={() => setOnlyBelowMinimum((v) => !v)}
                >
                  Abaixo do mínimo
                </Button>
                <p className="text-sm text-muted-foreground sm:ml-auto">
                  {data ? `${data.total} posição(ões)` : ""}
                </p>
              </div>

              {positionsQuery.isLoading ? (
                <LoadingState rows={5} />
              ) : positionsQuery.error ? (
                <ErrorState
                  description={(positionsQuery.error as Error).message}
                  onRetry={() => void positionsQuery.refetch()}
                />
              ) : !data?.rows.length ? (
                <EmptyState
                  title="Nenhuma posição de estoque"
                  description="Registre uma abertura de estoque ou uma entrada para começar."
                  icon={<Warehouse className="h-8 w-8" />}
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto / SKU</TableHead>
                          <TableHead>Localização</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                          <TableHead className="text-right">Mínimo</TableHead>
                          <TableHead>Última movimentação</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.map((row) => (
                          <PositionRow
                            key={`${row.variant_id}:${row.location_id}`}
                            row={row}
                            canMove={canMove}
                            onAdjust={() => {
                              setSeed({ variantId: row.variant_id, locationId: row.location_id });
                              setDialogOpen(true);
                            }}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {data.total > PAGE_SIZE ? (
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Página {data.page} de {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page * PAGE_SIZE >= data.total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <MovementDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            initialVariantId={seed.variantId}
            initialLocationId={seed.locationId}
          />
        </>
      )}
    </AppShell>
  );
}

function PositionRow({
  row,
  canMove,
  onAdjust,
}: {
  row: InventoryPositionRow;
  canMove: boolean;
  onAdjust: () => void;
}) {
  const attrs = [row.size, row.color].filter(Boolean).join(" · ");
  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium">{row.product_name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {row.sku}
            {attrs ? ` · ${attrs}` : ""}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <PackageSearch className="h-4 w-4 text-muted-foreground" />
          <span>{row.location_name}</span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono font-medium">
        {formatQuantity(row.on_hand)}
      </TableCell>
      <TableCell className="text-right">
        {row.below_minimum ? (
          <Badge variant="destructive">abaixo de {formatQuantity(row.minimum_stock)}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">{formatQuantity(row.minimum_stock)}</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.last_movement_at ? new Date(row.last_movement_at).toLocaleString("pt-BR") : "—"}
      </TableCell>
      <TableCell className="text-right">
        {canMove ? (
          <Button variant="outline" size="sm" onClick={onAdjust}>
            Movimentar
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
