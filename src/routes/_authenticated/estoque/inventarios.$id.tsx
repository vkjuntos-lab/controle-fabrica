import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { countStatusLabel, formatQuantity } from "@/lib/inventory/constants";
import {
  cancelInventoryCount,
  completeInventoryCount,
  getInventoryCount,
  updateInventoryCountItem,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/inventarios/$id")({
  head: () => ({
    meta: [
      { title: "Contagem de inventário — Estratégia" },
      { name: "description", content: "Detalhe da contagem física de estoque." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CountDetailPage,
});

function CountDetailPage() {
  const { id } = Route.useParams();
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();

  const fetchCount = useServerFn(getInventoryCount);
  const saveItem = useServerFn(updateInventoryCountItem);
  const completeCount = useServerFn(completeInventoryCount);
  const cancelCount = useServerFn(cancelInventoryCount);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [onlyDivergent, setOnlyDivergent] = useState(false);

  const countQuery = useQuery({
    queryKey: ["inventory-count", organizationId, id],
    queryFn: () => fetchCount({ data: { organizationId: organizationId!, countId: id } }),
    enabled: Boolean(organizationId),
  });

  useEffect(() => {
    if (!countQuery.data) return;
    const next: Record<string, string> = {};
    for (const item of countQuery.data.items) {
      next[item.id] = item.counted_quantity == null ? "" : String(item.counted_quantity);
    }
    setDrafts(next);
  }, [countQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inventory-count"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-positions"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ itemId, value }: { itemId: string; value: number | null }) =>
      saveItem({
        data: { organizationId: organizationId!, countId: id, itemId, countedQuantity: value },
      }),
    onSuccess: invalidate,
    onError: (error: Error) =>
      toast.error("Não foi possível salvar o item", { description: error.message }),
  });

  const completeMutation = useMutation({
    mutationFn: () => completeCount({ data: { organizationId: organizationId!, countId: id } }),
    onSuccess: () => {
      toast.success("Contagem concluída e ajustes lançados no ledger");
      setConfirmOpen(false);
      invalidate();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível concluir", { description: error.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelCount({ data: { organizationId: organizationId!, countId: id } }),
    onSuccess: () => {
      toast.success("Contagem cancelada");
      setCancelOpen(false);
      invalidate();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível cancelar", { description: error.message }),
  });

  const count = countQuery.data;
  const canCount = hasPermission(PERMISSIONS.inventoryCount);
  const editable =
    canCount &&
    (count?.status === "IN_PROGRESS" || count?.status === "DRAFT" || count?.status === "REVIEW");

  const pendingCount = useMemo(
    () => (count ? count.items.filter((i) => i.counted_quantity == null).length : 0),
    [count],
  );

  const visibleItems = useMemo(() => {
    if (!count) return [];
    if (!onlyDivergent) return count.items;
    return count.items.filter((item) => {
      const draft = drafts[item.id];
      if (draft === undefined || draft === "")
        return item.counted_quantity == null && item.system_quantity !== 0;
      return Number(draft) - item.system_quantity !== 0;
    });
  }, [count, drafts, onlyDivergent]);

  function commitItem(itemId: string, rawDraft: string | undefined) {
    const raw = (rawDraft ?? "").trim();
    const value = raw === "" ? null : Number(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      toast.error("Quantidade inválida");
      return;
    }
    saveMutation.mutate({ itemId, value });
  }

  return (
    <AppShell title="Estoque · Contagem">
      {orgLoading ? (
        <LoadingState rows={4} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.inventoryRead) ? (
        <PermissionDenied permission={PERMISSIONS.inventoryRead} />
      ) : countQuery.isLoading ? (
        <LoadingState rows={5} />
      ) : countQuery.error ? (
        <ErrorState
          description={(countQuery.error as Error).message}
          onRetry={() => void countQuery.refetch()}
        />
      ) : !count ? (
        <ErrorState title="Contagem não encontrada" />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm">
                <Link to="/estoque/inventarios">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Link>
              </Button>
              <div>
                <h2 className="font-heading text-lg font-semibold">{count.location_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {countStatusLabel(count.status)} · {count.items.length - pendingCount} de{" "}
                  {count.items.length} itens contados
                </p>
              </div>
            </div>
            {editable ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setCancelOpen(true)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar contagem
                </Button>
                <Button onClick={() => setConfirmOpen(true)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Concluir contagem
                </Button>
              </div>
            ) : null}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Itens da contagem</CardTitle>
              <Button
                variant={onlyDivergent ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyDivergent((v) => !v)}
              >
                Somente divergências
              </Button>
            </CardHeader>
            <CardContent>
              {!count.items.length ? (
                <EmptyState title="Nenhum item nesta contagem" />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Variante</TableHead>
                        <TableHead className="text-right">Sistema</TableHead>
                        <TableHead className="w-32 text-right">Contado</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleItems.map((item) => {
                        const draft = drafts[item.id];
                        const draftNumber =
                          draft === undefined || draft === "" ? null : Number(draft);
                        const difference =
                          draftNumber == null
                            ? item.difference
                            : draftNumber - item.system_quantity;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">{item.sku}</span>
                              {item.size || item.color ? (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  {[item.size, item.color].filter(Boolean).join(" · ")}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatQuantity(item.system_quantity)}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.001"
                                inputMode="decimal"
                                className="text-right"
                                disabled={!editable}
                                value={draft ?? ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                onBlur={(e) => commitItem(item.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {difference == null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : difference === 0 ? (
                                <span className="text-muted-foreground">0</span>
                              ) : (
                                <span
                                  className={
                                    difference > 0 ? "text-emerald-600" : "text-destructive"
                                  }
                                >
                                  {difference > 0 ? "+" : ""}
                                  {formatQuantity(difference)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  item.counted_quantity == null
                                    ? "secondary"
                                    : difference === 0
                                      ? "outline"
                                      : "default"
                                }
                              >
                                {item.counted_quantity == null
                                  ? "Pendente"
                                  : difference === 0
                                    ? "OK"
                                    : "Divergente"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Concluir contagem</DialogTitle>
                <DialogDescription>
                  As divergências serão lançadas como ajustes no ledger. Itens não contados não
                  geram movimento. Esta ação não pode ser desfeita (apenas revertida depois).
                </DialogDescription>
              </DialogHeader>
              {pendingCount > 0 ? (
                <p className="text-sm text-amber-600">
                  {pendingCount} item(ns) ainda sem contagem serão ignorados.
                </p>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                >
                  {completeMutation.isPending ? "Concluindo..." : "Concluir e lançar ajustes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Cancelar contagem</DialogTitle>
                <DialogDescription>
                  Nenhum ajuste será lançado. A contagem ficará registrada como cancelada.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCancelOpen(false)}>
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? "Cancelando..." : "Cancelar contagem"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AppShell>
  );
}
