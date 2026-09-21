import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  expectedDirection,
  movementDirectionLabel,
  MOVEMENT_TYPES,
  type MovementDirection,
  type MovementType,
} from "@/lib/inventory/constants";
import {
  listInventoryLocations,
  listVariantOptions,
  postInventoryMovement,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";

/** Tipos postados diretamente (par dedicado: transferências, reversão, parceiro). */
const DEDICATED_TYPES = new Set<MovementType>([
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "REVERSAL",
  "PARTNER_SHIPMENT",
  "PARTNER_RETURN",
]);

export function MovementDialog({
  open,
  onOpenChange,
  initialVariantId,
  initialLocationId,
  initialMovementType,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialVariantId?: string;
  initialLocationId?: string;
  initialMovementType?: MovementType;
}) {
  const { currentOrganization, hasPermission } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();
  const fetchVariants = useServerFn(listVariantOptions);
  const fetchLocations = useServerFn(listInventoryLocations);
  const postMovement = useServerFn(postInventoryMovement);

  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("PURCHASE_RECEIPT");
  const [direction, setDirection] = useState<MovementDirection>("IN");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const allowNegativeTypes = MOVEMENT_TYPES.filter(
    (m) => !DEDICATED_TYPES.has(m.value) && hasPermission(m.permission),
  );

  const variantsQuery = useQuery({
    queryKey: ["inventory-variant-options", organizationId],
    queryFn: () => fetchVariants({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId && open),
  });

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations", organizationId, "active"],
    queryFn: () =>
      fetchLocations({ data: { organizationId: organizationId!, includeInactive: false } }),
    enabled: Boolean(organizationId && open),
  });

  useEffect(() => {
    if (!open) return;
    setVariantId(initialVariantId ?? "");
    setLocationId(initialLocationId ?? "");
    setMovementType(initialMovementType ?? "PURCHASE_RECEIPT");
    setQuantity("");
    setReason("");
  }, [open, initialVariantId, initialLocationId, initialMovementType]);

  useEffect(() => {
    setDirection(expectedDirection(movementType) === "OUT" ? "OUT" : "IN");
  }, [movementType]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Nenhuma organização selecionada.");
      const expected = expectedDirection(movementType);
      await postMovement({
        data: {
          organizationId,
          variantId,
          locationId,
          movementType,
          quantity: Number(quantity),
          direction: expected === "FLEX" ? direction : undefined,
          reason: reason || null,
          referenceType: "MANUAL",
        },
      });
    },
    onSuccess: () => {
      toast.success("Movimento registrado no ledger");
      void queryClient.invalidateQueries({ queryKey: ["inventory-positions"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error("Não foi possível registrar", { description: error.message }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!variantId || !locationId) {
      toast.error("Selecione a variante e a localização");
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast.error("Informe uma quantidade maior que zero");
      return;
    }
    mutation.mutate();
  }

  const selectedType = MOVEMENT_TYPES.find((m) => m.value === movementType);
  const needsReason = movementType === "LOSS" || movementType === "MANUAL_CORRECTION";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar movimento</DialogTitle>
          <DialogDescription>
            Todo movimento é imutável e entra no ledger. Correção de erro é feita por reversão.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="movement-type">Tipo de movimento *</Label>
            <Select value={movementType} onValueChange={(v) => setMovementType(v as MovementType)}>
              <SelectTrigger id="movement-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowNegativeTypes.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="movement-variant">Variante (SKU) *</Label>
            <Select value={variantId} onValueChange={setVariantId}>
              <SelectTrigger id="movement-variant">
                <SelectValue placeholder="Selecione a variante..." />
              </SelectTrigger>
              <SelectContent>
                {variantsQuery.data?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="movement-location">Localização *</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="movement-location">
                <SelectValue placeholder="Selecione a localização..." />
              </SelectTrigger>
              <SelectContent>
                {locationsQuery.data?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="movement-quantity">Quantidade *</Label>
              <Input
                id="movement-quantity"
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Direção</Label>
              {expectedDirection(movementType) === "FLEX" ? (
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as MovementDirection)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">{movementDirectionLabel("IN")}</SelectItem>
                    <SelectItem value="OUT">{movementDirectionLabel("OUT")}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-10 items-center text-sm text-muted-foreground">
                  {selectedType
                    ? movementDirectionLabel(expectedDirection(movementType) as MovementDirection)
                    : "—"}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="movement-reason">Motivo {needsReason ? "*" : ""}</Label>
            <Textarea
              id="movement-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Descreva o motivo (obrigatório para perda e correção manual)."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Registrando..." : "Registrar movimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
