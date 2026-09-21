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
import { formatQuantity, transferStatusLabel } from "@/lib/inventory/constants";
import { listInventoryTransfers } from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/transferencias")({
  head: () => ({
    meta: [
      { title: "Transferências de estoque — Estratégia" },
      { name: "description", content: "Transferências internas e remessas a parceiros." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransfersPage,
});

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: "Transferência interna",
  PARTNER_SHIPMENT: "Remessa a parceiro",
  PARTNER_RETURN: "Retorno de parceiro",
};

function TransfersPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;

  const fetchTransfers = useServerFn(listInventoryTransfers);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const transfersQuery = useQuery({
    queryKey: ["inventory-transfers", organizationId, page],
    queryFn: () =>
      fetchTransfers({ data: { organizationId: organizationId!, page, pageSize: 20 } }),
    enabled: Boolean(organizationId),
  });

  const data = transfersQuery.data;
  const canOperate =
    hasPermission(PERMISSIONS.inventoryTransfer) || hasPermission(PERMISSIONS.inventoryMove);

  return (
    <AppShell title="Estoque · Transferências">
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
              <h2 className="font-heading text-lg font-semibold">Transferências e remessas</h2>
              <p className="text-sm text-muted-foreground">
                Cada operação gera saída na origem e entrada no destino na mesma transação.
              </p>
            </div>
            {canOperate ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova operação
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de operações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {transfersQuery.isLoading ? (
                <LoadingState rows={5} />
              ) : transfersQuery.error ? (
                <ErrorState
                  description={(transfersQuery.error as Error).message}
                  onRetry={() => void transfersQuery.refetch()}
                />
              ) : !data?.rows.length ? (
                <EmptyState
                  title="Nenhuma operação registrada"
                  description="Transferências internas e remessas a parceiros aparecem aqui."
                  icon={<Handshake className="h-8 w-8" />}
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Operação</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Destino</TableHead>
                          <TableHead>Itens</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {new Date(row.requested_at).toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell>
                              {TYPE_LABEL[row.transfer_type] ?? row.transfer_type}
                            </TableCell>
                            <TableCell>{row.source_location_name}</TableCell>
                            <TableCell>{row.destination_location_name}</TableCell>
                            <TableCell>
                              <div className="space-y-0.5">
                                {row.items.map((item) => (
                                  <p key={item.variant_id} className="text-xs">
                                    <span className="font-mono">{item.sku}</span> ·{" "}
                                    {formatQuantity(item.quantity)}
                                  </p>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.status === "COMPLETED" ? "default" : "secondary"}>
                                {transferStatusLabel(row.status as never)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {data.total > 20 ? (
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
                        Página {data.page} de {Math.max(1, Math.ceil(data.total / 20))}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page * 20 >= data.total}
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

          <TransferDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
      )}
    </AppShell>
  );
}
