import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, PackageSearch, Plus, Warehouse } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { toast } from "sonner";
import { OperationalSummary } from "@/components/inventory/operational-summary";
import { listCategories } from "@/lib/products/products.functions";
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
import { formatQuantity, type MovementType } from "@/lib/inventory/constants";
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

  const fetchCategories = useServerFn(listCategories);
  const categories = useQuery({
    queryKey: ["product-categories", organizationId],
    queryFn: () => fetchCategories({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId && hasPermission(PERMISSIONS.productsRead)),
  });
  const [categoryId, setCategoryId] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "DRAFT" | "DISCONTINUED">(
    "ALL",
  );
  const [groupBy, setGroupBy] = useState<"none" | "product" | "location">("none");
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [locationId, setLocationId] = useState("ALL");
  const [onlyBelowMinimum, setOnlyBelowMinimum] = useState(false);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seed, setSeed] = useState<{
    variantId?: string;
    locationId?: string;
    movementType?: MovementType;
  }>({});

  useEffect(() => {
    setPage(1);
  }, [organizationId, deferredQuery, locationId, onlyBelowMinimum, categoryId, status, groupBy]);

  const positionsQuery = useQuery({
    queryKey: [
      "inventory-positions",
      organizationId,
      deferredQuery,
      categoryId,
      status,
      groupBy,
      locationId,
      onlyBelowMinimum,
      page,
    ],
    queryFn: () =>
      fetchPositions({
        data: {
          organizationId: organizationId!,
          query: deferredQuery,
          categoryId: categoryId === "ALL" ? undefined : categoryId,
          status: status === "ALL" ? undefined : status,
          groupBy: groupBy === "none" ? undefined : groupBy,
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
    hasPermission(PERMISSIONS.inventoryMove) ||
    hasPermission(PERMISSIONS.inventoryAdjust) ||
    hasPermission(PERMISSIONS.inventoryOpeningBalance);

  async function handleExport() {
    if (!data?.rows.length) {
      return;
    }
    setExporting(true);
    try {
      const rows: InventoryPositionRow[] = [];
      let next = 1;
      while (true) {
        const result = await fetchPositions({
          data: {
            organizationId: organizationId!,
            query: deferredQuery,
            locationId: locationId === "ALL" ? undefined : locationId,
            categoryId: categoryId === "ALL" ? undefined : categoryId,
            status: status === "ALL" ? undefined : status,
            onlyBelowMinimum,
            page: next,
            pageSize: 200,
          },
        });
        rows.push(...result.rows);
        if (next * 200 >= result.total) break;
        next++;
      }
      const csv = toCsv(
        rows.map((row) => ({
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
    } catch (error) {
      toast.error("Falha na exportação", { description: (error as Error).message });
    } finally {
      setExporting(false);
    }
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
              <div className="flex flex-wrap gap-2">
                {hasPermission(PERMISSIONS.inventoryAdjust) ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSeed({ movementType: "ADJUSTMENT_IN" });
                      setDialogOpen(true);
                    }}
                  >
                    Ajustar estoque
                  </Button>
                ) : null}
                {hasPermission(PERMISSIONS.inventoryOpeningBalance) ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSeed({ movementType: "OPENING_BALANCE" });
                      setDialogOpen(true);
                    }}
                  >
                    Abertura de estoque
                  </Button>
                ) : null}
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

          <OperationalSummary organizationId={organizationId!} />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Saldos por localização</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || !data?.rows.length}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "Exportando..." : "Exportar CSV"}
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
                    placeholder="Produto, SKU, barcode, tamanho, cor..."
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

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      {categories.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status da variante</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        ["ALL", "Todos"],
                        ["ACTIVE", "Ativo"],
                        ["INACTIVE", "Inativo"],
                        ["DRAFT", "Rascunho"],
                        ["DISCONTINUED", "Descontinuado"],
                      ].map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agrupar</Label>
                  <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Variante / localização</SelectItem>
                      <SelectItem value="product">Produto</SelectItem>
                      <SelectItem value="location">Localização</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                  title="Nenhum resultado para os filtros"
                  description="Revise os filtros ou cadastre produtos e localizações para começar."
                  icon={<Warehouse className="h-8 w-8" />}
                />
              ) : (
                <>
                  {groupBy !== "none" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {data.groups.map((g) => (
                        <div key={g.id} className="rounded-lg border p-4">
                          <p>{g.name}</p>
                          <strong>{formatQuantity(g.on_hand)} un. On Hand</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:hidden">
                        {data.rows.map((row) => (
                          <div
                            key={`${row.variant_id}:${row.location_id}`}
                            className="space-y-2 rounded-lg border p-3"
                          >
                            <p className="font-medium">{row.product_name}</p>
                            <p className="text-sm">
                              {row.sku} · {[row.size, row.color].filter(Boolean).join(" / ")}
                            </p>
                            <p>
                              {row.location_name}:{" "}
                              <strong>{formatQuantity(row.on_hand)} On Hand</strong>
                            </p>
                            {row.below_minimum ? (
                              <Badge variant="destructive">Abaixo do mínimo</Badge>
                            ) : null}
                            {canMove ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSeed({
                                    variantId: row.variant_id,
                                    locationId: row.location_id,
                                  });
                                  setDialogOpen(true);
                                }}
                              >
                                Movimentar
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div className="hidden overflow-x-auto rounded-lg border sm:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Produto / SKU</TableHead>
                              <TableHead>Localização</TableHead>
                              <TableHead className="text-right">On Hand</TableHead>
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
                                  setSeed({
                                    variantId: row.variant_id,
                                    locationId: row.location_id,
                                  });
                                  setDialogOpen(true);
                                }}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                  {(groupBy === "none" ? data.total : data.group_total) > PAGE_SIZE ? (
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
                        Página {data.page} de{" "}
                        {Math.max(
                          1,
                          Math.ceil(
                            (groupBy === "none" ? data.total : data.group_total) / PAGE_SIZE,
                          ),
                        )}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          page * PAGE_SIZE >= (groupBy === "none" ? data.total : data.group_total)
                        }
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
            initialMovementType={seed.movementType}
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
