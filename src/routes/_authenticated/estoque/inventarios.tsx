import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { countStatusLabel } from "@/lib/inventory/constants";
import {
  createInventoryCount,
  listInventoryCounts,
  listInventoryLocations,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/inventarios")({
  head: () => ({
    meta: [
      { title: "Inventários — Estratégia" },
      { name: "description", content: "Contagens físicas e ajustes de inventário." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CountsPage,
});

function CountStatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED"
      ? "default"
      : status === "CANCELED"
        ? "secondary"
        : status === "REVIEW"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{countStatusLabel(status as never)}</Badge>;
}

function CountsPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const fetchCounts = useServerFn(listInventoryCounts);
  const fetchLocations = useServerFn(listInventoryLocations);
  const createCount = useServerFn(createInventoryCount);

  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [locationId, setLocationId] = useState("");

  const countsQuery = useQuery({
    queryKey: ["inventory-counts", organizationId, page],
    queryFn: () => fetchCounts({ data: { organizationId: organizationId!, page } }),
    enabled: Boolean(organizationId),
  });

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations", organizationId, "active"],
    queryFn: () =>
      fetchLocations({ data: { organizationId: organizationId!, includeInactive: false } }),
    enabled: Boolean(organizationId && dialogOpen),
  });

  const mutation = useMutation({
    mutationFn: () => createCount({ data: { organizationId: organizationId!, locationId } }),
    onSuccess: (result) => {
      toast.success("Contagem iniciada");
      void queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
      setDialogOpen(false);
      setLocationId("");
      void navigate({ to: "/estoque/inventarios/$id", params: { id: result.id } });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível iniciar", { description: error.message }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!locationId) {
      toast.error("Selecione a localização");
      return;
    }
    mutation.mutate();
  }

  const canCount = hasPermission(PERMISSIONS.inventoryCount);

  return (
    <AppShell title="Estoque · Inventários">
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
              <h2 className="font-heading text-lg font-semibold">Inventários</h2>
              <p className="text-sm text-muted-foreground">
                A contagem compara o saldo do sistema com o contado e gera ajustes no ledger ao ser
                concluída.
              </p>
            </div>
            {canCount ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova contagem
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contagens registradas</CardTitle>
            </CardHeader>
            <CardContent>
              {countsQuery.isLoading ? (
                <LoadingState rows={5} />
              ) : countsQuery.error ? (
                <ErrorState
                  description={(countsQuery.error as Error).message}
                  onRetry={() => void countsQuery.refetch()}
                />
              ) : !countsQuery.data?.rows.length ? (
                <EmptyState
                  title="Nenhuma contagem"
                  description="Inicie uma contagem para reconciliar o estoque físico."
                  icon={<ClipboardList className="h-8 w-8" />}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Localização</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progresso</TableHead>
                        <TableHead>Divergências</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Criada em</TableHead>
                        <TableHead>Concluída em</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {countsQuery.data.rows.map((count) => (
                        <TableRow key={count.id}>
                          <TableCell className="font-medium">{count.location_name}</TableCell>
                          <TableCell>
                            <CountStatusBadge status={count.status} />
                          </TableCell>
                          <TableCell className="text-sm">
                            {count.counted_count}/{count.items_count} itens
                          </TableCell>
                          <TableCell>{count.differences}</TableCell>
                          <TableCell>{count.responsible}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(count.created_at).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {count.completed_at
                              ? new Date(count.completed_at).toLocaleString("pt-BR")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link to="/estoque/inventarios/$id" params={{ id: count.id }}>
                                Abrir
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {countsQuery.data && countsQuery.data.total > 50 ? (
                <div className="mt-4 flex justify-between">
                  <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <span>Página {page}</span>
                  <Button
                    disabled={page * 50 >= countsQuery.data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nova contagem</DialogTitle>
                <DialogDescription>
                  Serão incluídas todas as variantes ativas com o saldo do sistema na localização
                  escolhida. A localização ficará bloqueada para movimentos até concluir ou
                  cancelar.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Localização *</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locationsQuery.data?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Iniciando..." : "Iniciar contagem"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AppShell>
  );
}
