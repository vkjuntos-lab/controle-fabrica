import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Handshake, Plus } from "lucide-react";
import { useState } from "react";

import { TransferDialog } from "@/components/inventory/transfer-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatQuantity } from "@/lib/inventory/constants";
import { listThirdPartyPositions } from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/terceiros")({
  head: () => ({
    meta: [
      { title: "Estoque em terceiros — Estratégia" },
      { name: "description", content: "Mercadoria em poder de parceiros e consignados." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThirdPartyPage,
});

function ThirdPartyPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const fetchPositions = useServerFn(listThirdPartyPositions);
  const [page, setPage] = useState(1);
  const [shipmentOpen, setShipmentOpen] = useState(false);

  const positionsQuery = useQuery({
    queryKey: ["inventory-third-party", organizationId, page],
    queryFn: () => fetchPositions({ data: { organizationId: organizationId!, page } }),
    enabled: Boolean(organizationId),
  });

  const data = positionsQuery.data;
  const canShip = hasPermission(PERMISSIONS.inventoryMove);
  const totalUnits = data?.total_on_hand ?? 0;

  return (
    <AppShell title="Estoque · Em terceiros">
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
              <h2 className="font-heading text-lg font-semibold">Em poder de terceiros</h2>
              <p className="text-sm text-muted-foreground">
                Saldos em localizações do tipo parceiro. Remessa não é venda — a propriedade pode
                continuar com a organização.
              </p>
            </div>
            {canShip ? (
              <Button onClick={() => setShipmentOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Registrar remessa
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Posições de parceiros
                {data ? (
                  <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                    {formatQuantity(totalUnits)} un.
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {positionsQuery.isLoading ? (
                <LoadingState rows={5} />
              ) : positionsQuery.error ? (
                <ErrorState
                  description={(positionsQuery.error as Error).message}
                  onRetry={() => void positionsQuery.refetch()}
                />
              ) : !data?.rows.length ? (
                <EmptyState
                  title="Nenhuma mercadoria em terceiros"
                  description="Cadastre uma localização do tipo parceiro e registre uma remessa."
                  icon={<Handshake className="h-8 w-8" />}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parceiro</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Variante</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                        <TableHead>Último movimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row) => (
                        <TableRow key={`${row.variant_id}:${row.location_id}`}>
                          <TableCell>
                            <p className="font-medium">{row.location_name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {row.location_code}
                            </p>
                          </TableCell>
                          <TableCell>{row.product_name}</TableCell>
                          <TableCell>
                            <span className="font-mono text-xs">{row.sku}</span>
                            {row.size || row.color ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {[row.size, row.color].filter(Boolean).join(" · ")}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono">{formatQuantity(row.on_hand)}</span>
                            {row.below_minimum ? (
                              <Badge variant="destructive" className="ml-2">
                                abaixo do mínimo
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.last_movement_at
                              ? new Date(row.last_movement_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {data && data.total > 50 ? (
                <div className="mt-4 flex justify-between">
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {page} de {Math.ceil(data.total / 50)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page * 50 >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <TransferDialog
            open={shipmentOpen}
            onOpenChange={setShipmentOpen}
            defaultTransferType="PARTNER_SHIPMENT"
          />
        </>
      )}
    </AppShell>
  );
}
