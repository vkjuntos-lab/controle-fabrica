import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
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
import { locationTypeLabel } from "@/lib/inventory/constants";
import {
  listBatches,
  listInventoryLocations,
  listVariantOptions,
  postInventoryTransfer,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

type TransferType = "TRANSFER" | "PARTNER_SHIPMENT" | "PARTNER_RETURN";

type Item = { key: string; variantId: string; quantity: string; batchId?: string };

export function TransferDialog({
  open,
  onOpenChange,
  defaultTransferType = "TRANSFER",
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  defaultTransferType?: TransferType;
}) {
  const { currentOrganization, hasPermission } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();
  const fetchLocations = useServerFn(listInventoryLocations);
  const fetchBatches = useServerFn(listBatches);
  const [variantSearch, setVariantSearch] = useState("");
  const fetchVariants = useServerFn(listVariantOptions);
  const postTransfer = useServerFn(postInventoryTransfer);

  const [transferType, setTransferType] = useState<TransferType>(defaultTransferType);
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [items, setItems] = useState<Item[]>([
    { key: crypto.randomUUID(), variantId: "", quantity: "" },
  ]);
  const [idempotencyKey, setIdempotencyKey] = useState(crypto.randomUUID());
  const [notes, setNotes] = useState("");

  const allTypes: { value: TransferType; label: string; enabled: boolean }[] = [
    {
      value: "TRANSFER",
      label: "Transferência interna",
      enabled: hasPermission(PERMISSIONS.inventoryTransfer),
    },
    {
      value: "PARTNER_SHIPMENT",
      label: "Remessa para parceiro",
      enabled: hasPermission(PERMISSIONS.inventoryMove),
    },
    {
      value: "PARTNER_RETURN",
      label: "Retorno de parceiro",
      enabled: hasPermission(PERMISSIONS.inventoryMove),
    },
  ];
  const availableTypes = allTypes.filter((t) => t.enabled);

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations", organizationId, "active"],
    queryFn: () =>
      fetchLocations({ data: { organizationId: organizationId!, includeInactive: false } }),
    enabled: Boolean(organizationId && open),
  });

  const variantsQuery = useQuery({
    queryKey: ["inventory-variant-options", organizationId, variantSearch],
    queryFn: () =>
      fetchVariants({ data: { organizationId: organizationId!, query: variantSearch } }),
    enabled: Boolean(organizationId && open),
  });

  const batches = useQuery({
    queryKey: ["inventory-batches", organizationId],
    queryFn: () => fetchBatches({ data: { organizationId: organizationId! } }),
    enabled: Boolean(open && organizationId),
  });

  useEffect(() => {
    if (!open) return;
    setTransferType(defaultTransferType);
    setSourceLocationId("");
    setDestinationLocationId("");
    setItems([{ key: crypto.randomUUID(), variantId: "", quantity: "" }]);
    setNotes("");
    setIdempotencyKey(crypto.randomUUID());
  }, [open, defaultTransferType]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Nenhuma organização selecionada.");
      const validItems = items
        .filter((i) => i.variantId && Number(i.quantity) > 0)
        .map((i) => ({
          variantId: i.variantId,
          quantity: Number(i.quantity),
          batchId: i.batchId || null,
        }));
      return await postTransfer({
        data: {
          organizationId,
          sourceLocationId,
          destinationLocationId,
          transferType,
          items: validItems,
          notes: notes || null,
          idempotencyKey,
        },
      });
    },
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
      toast.success("Operação registrada");
      void queryClient.invalidateQueries({ queryKey: ["inventory-positions"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error("Não foi possível registrar", { description: error.message }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sourceLocationId || !destinationLocationId) {
      toast.error("Selecione origem e destino");
      return;
    }
    if (sourceLocationId === destinationLocationId) {
      toast.error("Origem e destino devem ser diferentes");
      return;
    }
    const validItems = items.filter((i) => i.variantId && Number(i.quantity) > 0);
    if (!validItems.length || validItems.length !== items.length) {
      toast.error("Preencha todos os itens com variante e quantidade válida");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova operação de estoque</DialogTitle>
          <DialogDescription>
            Transferência e remessa geram o par saída/entrada de forma atômica no ledger.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            aria-label="Buscar variantes"
            placeholder="Buscar produto, SKU ou barcode"
            value={variantSearch}
            onChange={(e) => setVariantSearch(e.target.value)}
          />
          {variantsQuery.error || locationsQuery.error || batches.error ? (
            <p role="alert">
              {variantsQuery.error?.message ??
                locationsQuery.error?.message ??
                batches.error?.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Operação *</Label>
              <Select
                value={transferType}
                onValueChange={(v) => setTransferType(v as TransferType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Origem *</Label>
              <Select value={sourceLocationId} onValueChange={setSourceLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {locationsQuery.data?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} · {locationTypeLabel(l.type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destino *</Label>
              <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {locationsQuery.data?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} · {locationTypeLabel(l.type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Itens *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { key: crypto.randomUUID(), variantId: "", quantity: "" },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar item
              </Button>
            </div>
            {items.map((item, index) => (
              <div key={item.key} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Select
                    value={item.variantId}
                    onValueChange={(v) =>
                      setItems((prev) =>
                        prev.map((it) =>
                          it.key === item.key ? { ...it, variantId: v, batchId: undefined } : it,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Variante ${index + 1}...`} />
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
                <div className="w-32">
                  <Select
                    value={item.batchId || "NONE"}
                    onValueChange={(v) =>
                      setItems((previous) =>
                        previous.map((it) =>
                          it.key === item.key
                            ? { ...it, batchId: v === "NONE" ? undefined : v }
                            : it,
                        ),
                      )
                    }
                  >
                    <SelectTrigger aria-label="Lote">
                      <SelectValue placeholder="Sem lote" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Sem lote</SelectItem>
                      {batches.data
                        ?.filter((b) => b.variant_id === item.variantId)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.batch_code}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="Qtd."
                    value={item.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it) =>
                          it.key === item.key ? { ...it, quantity: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={items.length <= 1}
                  onClick={() => setItems((prev) => prev.filter((it) => it.key !== item.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-notes">Observações</Label>
            <Textarea
              id="transfer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Registrando..." : "Registrar operação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
