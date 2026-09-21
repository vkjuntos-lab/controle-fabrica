import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight, Download, Plus } from "lucide-react";
import { useState } from "react";

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
import {
  formatQuantity,
  movementDirectionLabel,
  movementStatusLabel,
  movementTypeLabel,
  MOVEMENT_TYPES,
  type MovementDirection,
  type MovementType,
} from "@/lib/inventory/constants";
import {
  listInventoryLocations,
  listInventoryMovements,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/movimentacoes")({
  head: () => ({
    meta: [
      { title: "Movimentações de estoque — Estratégia" },
      { name: "description", content: "Ledger imutável de movimentações de estoque." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MovementsPage,
});

const PAGE_SIZE = 30;

function MovementsPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;

  const fetchMovements = useServerFn(listInventoryMovements);
  const fetchLocations = useServerFn(listInventoryLocations);

  const [movementType, setMovementType] = useState<MovementType | "ALL">("ALL");
  const [direction, setDirection] = useState<MovementDirection | "ALL">("ALL");
  const [locationId, setLocationId] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const movementsQuery = useQuery({
    queryKey: [
      "inventory-movements",
      organizationId,
      movementType,
      direction,
      locationId,
      dateFrom,
      dateTo,
      page,
    ],
    queryFn: () =>
      fetchMovements({
        data: {
          organizationId: organizationId!,
          movementType: movementType === "ALL" ? undefined : movementType,
          direction: direction === "ALL" ? undefined : direction,
          locationId: locationId === "ALL" ? undefined : locationId,
          dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
          dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
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

  const data = movementsQuery.data;
  const canMove = hasPermission(PERMISSIONS.inventoryMove);

  function handleExport() {
    if (!data?.rows.length) return;
    const csv = toCsv(
      data.rows.map((row) => ({
        data: new Date(row.occurred_at).toLocaleString("pt-BR"),
        tipo: movementTypeLabel(row.movement_type),
        direcao: movementDirectionLabel(row.direction),
        quantidade: row.quantity,
        unidade: row.unit,
        produto: row.product_name,
        sku: row.sku,
        localizacao: row.location_name,
        status: movementStatusLabel(row.status),
        motivo: row.reason ?? "",
        referencia: row.reference_type ?? "",
      })),
    );
    downloadCsv("estoque-movimentacoes.csv", csv);
  }

  return (
    <AppShell title="Estoque · Movimentações">
      {orgLoading ? (
        <LoadingState rows={4} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.inventoryMovementsRead) ? (
        <PermissionDenied permission={PERMISSIONS.inventoryMovementsRead} />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-lg font-semibold">Ledger de movimentações</h2>
              <p className="text-sm text-muted-foreground">
                Histórico imutável. Movimentos consolidados não são editados: correções geram
                reversão.
              </p>
            </div>
            {canMove ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo movimento
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Movimentações</CardTitle>
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={movementType}
                    onValueChange={(v) => {
                      setMovementType(v as MovementType | "ALL");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      {MOVEMENT_TYPES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Direção</Label>
                  <Select
                    value={direction}
                    onValueChange={(v) => {
                      setDirection(v as MovementDirection | "ALL");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      <SelectItem value="IN">Entrada</SelectItem>
                      <SelectItem value="OUT">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Localização</Label>
                  <Select
                    value={locationId}
                    onValueChange={(v) => {
                      setLocationId(v);
                      setPage(1);
                    }}
                  >
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
                <div className="space-y-2">
                  <Label htmlFor="date-from">De</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date-to">Até</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>

              {movementsQuery.isLoading ? (
                <LoadingState rows={5} />
              ) : movementsQuery.error ? (
                <ErrorState
                  description={(movementsQuery.error as Error).message}
                  onRetry={() => void movementsQuery.refetch()}
                />
              ) : !data?.rows.length ? (
                <EmptyState
                  title="Nenhuma movimentação encontrada"
                  description="Ajuste os filtros ou registre um novo movimento."
                  icon={<ArrowLeftRight className="h-8 w-8" />}
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Produto / SKU</TableHead>
                          <TableHead>Localização</TableHead>
                          <TableHead className="text-right">Qtd.</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Detalhe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {new Date(row.occurred_at).toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.direction === "IN" ? "default" : "secondary"}>
                                {movementTypeLabel(row.movement_type)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <p className="truncate font-medium">{row.product_name}</p>
                              <p className="font-mono text-xs text-muted-foreground">{row.sku}</p>
                            </TableCell>
                            <TableCell>{row.location_name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {row.direction === "IN" ? "+" : "−"}
                              {formatQuantity(row.quantity)} {row.unit}
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.status === "POSTED" ? "outline" : "secondary"}>
                                {movementStatusLabel(row.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild variant="outline" size="sm">
                                <Link to="/estoque/movimentacoes/$id" params={{ id: row.id }}>
                                  Ver
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
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

          <MovementDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
      )}
    </AppShell>
  );
}
