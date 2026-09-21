import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState, PermissionDenied } from "@/components/states";
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
import { Textarea } from "@/components/ui/textarea";
import {
  formatQuantity,
  locationTypeLabel,
  movementDirectionLabel,
  movementStatusLabel,
  movementTypeLabel,
  referenceTypeLabel,
} from "@/lib/inventory/constants";
import {
  getInventoryMovement,
  reverseInventoryMovement,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/movimentacoes/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da movimentação — Estratégia" },
      { name: "description", content: "Detalhe de um movimento do ledger de estoque." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MovementDetailPage,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function MovementDetailPage() {
  const { id } = Route.useParams();
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();

  const fetchMovement = useServerFn(getInventoryMovement);
  const reverseMovement = useServerFn(reverseInventoryMovement);

  const [revertOpen, setRevertOpen] = useState(false);
  const [reason, setReason] = useState("");

  const movementQuery = useQuery({
    queryKey: ["inventory-movement", organizationId, id],
    queryFn: () => fetchMovement({ data: { organizationId: organizationId!, movementId: id } }),
    enabled: Boolean(organizationId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      reverseMovement({ data: { organizationId: organizationId!, movementId: id, reason } }),
    onSuccess: (result) => {
      if (
        result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        typeof result.warning === "string"
      )
        toast.warning(result.warning);
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("inventory-"),
      });
      toast.success("Movimento revertido");
      setRevertOpen(false);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["inventory-movement"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-positions"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível reverter", { description: error.message }),
  });

  function handleRevert(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      toast.error("Informe o motivo da reversão");
      return;
    }
    mutation.mutate();
  }

  const movement = movementQuery.data;

  return (
    <AppShell title="Estoque · Movimentação">
      {orgLoading ? (
        <LoadingState rows={4} />
      ) : !currentOrganization ? (
        <ErrorState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.inventoryMovementsRead) ? (
        <PermissionDenied permission={PERMISSIONS.inventoryMovementsRead} />
      ) : movementQuery.isLoading ? (
        <LoadingState rows={4} />
      ) : movementQuery.error ? (
        <ErrorState
          description={(movementQuery.error as Error).message}
          onRetry={() => void movementQuery.refetch()}
        />
      ) : !movement ? (
        <ErrorState title="Movimento não encontrado" />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm">
                <Link to="/estoque/movimentacoes">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Link>
              </Button>
              <div>
                <h2 className="font-heading text-lg font-semibold">
                  {movementTypeLabel(movement.movement_type)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {new Date(movement.occurred_at).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
            {movement.status === "POSTED" &&
            !movement.reversed_by_id &&
            hasPermission(PERMISSIONS.inventoryReverse) &&
            movement.movement_type !== "REVERSAL" ? (
              <Button variant="outline" onClick={() => setRevertOpen(true)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reverter operação
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados do movimento</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field label="Status">
                <Badge variant={movement.status === "POSTED" ? "default" : "secondary"}>
                  {movementStatusLabel(movement.status)}
                </Badge>
              </Field>
              <Field label="Direção">{movementDirectionLabel(movement.direction)}</Field>
              <Field label="Quantidade">
                <span className="font-mono">
                  {movement.direction === "IN" ? "+" : "−"}
                  {formatQuantity(movement.quantity)} {movement.unit}
                </span>
              </Field>
              <Field label="Produto">
                {movement.product_name}
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  ({movement.sku})
                </span>
              </Field>
              <Field label="Localização">
                {movement.location_name}
                <span className="ml-1 text-xs text-muted-foreground">
                  {locationTypeLabel(movement.location_type)}
                </span>
              </Field>
              <Field label="Lote">{movement.batch_code ?? "—"}</Field>
              <Field label="Referência">
                {referenceTypeLabel(movement.reference_type)}
                {movement.reference_id ? (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {movement.reference_id.slice(0, 8)}
                  </span>
                ) : null}
              </Field>
              <Field label="Registrado por">{movement.created_by ?? "—"}</Field>
              <Field label="Idempotência">
                <span className="font-mono text-xs">{movement.idempotency_key ?? "—"}</span>
              </Field>
              <div className="sm:col-span-3">
                <Field label="Motivo">{movement.reason ?? "—"}</Field>
              </div>
              {movement.reversal_of_id ? (
                <div className="sm:col-span-3">
                  <Field label="Reversão de">
                    <Link
                      to="/estoque/movimentacoes/$id"
                      params={{ id: movement.reversal_of_id }}
                      className="text-primary underline"
                    >
                      {movement.reversal_of
                        ? `${movementTypeLabel(movement.reversal_of.movement_type)} — ${new Date(
                            movement.reversal_of.occurred_at,
                          ).toLocaleString("pt-BR")}`
                        : movement.reversal_of_id}
                    </Link>
                  </Field>
                </div>
              ) : null}
              {movement.reversed_by_id ? (
                <div className="sm:col-span-3">
                  <Field label="Revertido por">
                    <Link
                      to="/estoque/movimentacoes/$id"
                      params={{ id: movement.reversed_by_id }}
                      className="text-primary underline"
                    >
                      {movement.reversed_by
                        ? new Date(movement.reversed_by.occurred_at).toLocaleString("pt-BR")
                        : movement.reversed_by_id}
                    </Link>
                  </Field>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Dialog open={revertOpen} onOpenChange={setRevertOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reverter movimento</DialogTitle>
                <DialogDescription>
                  Uma reversão cria um novo movimento compensatório. O original permanece no
                  histórico — nada é excluído. Em transferência ou remessa, toda a operação é
                  compensada, incluindo as duas localizações.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleRevert} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="revert-reason">Motivo *</Label>
                  <Textarea
                    id="revert-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Explique por que este movimento está sendo revertido."
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRevertOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Revertendo..." : "Reverter"}
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
