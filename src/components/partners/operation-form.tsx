import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createPartnerOperation, queryPartners } from "@/lib/partners/partners.functions";
import {
  listInventoryLocations,
  listVariantOptions,
  listBatches,
  getInventoryBalance,
} from "@/lib/inventory/inventory.functions";
import type { CompanyRow, PartnerList } from "@/lib/partners/types";
const cls = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
type Item = {
  key: string;
  variant_id: string;
  batch_id: string | null;
  quantity: number;
  condition: "SELLABLE" | "DAMAGED" | "DEFECTIVE" | "OTHER";
  reason: string;
  label: string;
  barcode: string | null;
};
export function OperationForm({
  organizationId,
  kind,
  partner,
  shipmentId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  kind: "shipment" | "return";
  partner?: { id: string; name: string; location: string };
  shipmentId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const create = useServerFn(createPartnerOperation);
  const query = useServerFn(queryPartners);
  const fetchLocations = useServerFn(listInventoryLocations);
  const fetchVariants = useServerFn(listVariantOptions);
  const fetchBatches = useServerFn(listBatches);
  const fetchBalance = useServerFn(getInventoryBalance);
  const [companySearch, setCompanySearch] = useState("");
  const [partnerId, setPartnerId] = useState(partner?.id ?? "");
  const [search, setSearch] = useState("");
  const [variantId, setVariantId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [source, setSource] = useState(kind === "return" ? (partner?.location ?? "") : "");
  const [destination, setDestination] = useState(
    kind === "shipment" ? (partner?.location ?? "") : "",
  );
  const [items, setItems] = useState<Item[]>([]);
  const companies = useQuery({
    queryKey: ["partners", "options", organizationId, companySearch],
    queryFn: () =>
      query({ data: { organizationId, kind: "companies", filters: { query: companySearch } } }),
    enabled: !partner,
  });
  const locations = useQuery({
    queryKey: ["inventory-locations", organizationId, "active"],
    queryFn: () => fetchLocations({ data: { organizationId, includeInactive: false } }),
  });
  const variants = useQuery({
    queryKey: ["inventory-variant-options", organizationId, search],
    queryFn: () => fetchVariants({ data: { organizationId, query: search } }),
  });
  const batches = useQuery({
    queryKey: ["inventory-batches", organizationId, variantId],
    queryFn: () => fetchBatches({ data: { organizationId, variantId } }),
    enabled: Boolean(variantId),
  });
  const balance = useQuery({
    queryKey: ["inventory-balance", organizationId, variantId, source, batchId],
    queryFn: () =>
      fetchBalance({
        data: { organizationId, variantId, locationId: source, batchId: batchId || undefined },
      }),
    enabled: Boolean(variantId && source),
  });
  const companyRows = ((companies.data as PartnerList | undefined)?.rows ?? []) as CompanyRow[];
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return create({
        data: {
          organizationId,
          kind,
          operation: {
            partner_id: partnerId,
            source_location_id: source,
            destination_location_id: destination,
            shipment_id: shipmentId,
            date: String(f.date),
            expected_delivery_date: String(f.expected_delivery_date ?? ""),
            carrier_name: String(f.carrier_name ?? ""),
            tracking_code: String(f.tracking_code ?? ""),
            notes: String(f.notes),
            items: items.map(({ variant_id, batch_id, quantity, condition, reason }) => ({
              variant_id,
              batch_id,
              quantity,
              condition,
              reason,
            })),
          },
        },
      });
    },
    onSuccess: (id) => {
      toast.success(
        kind === "shipment"
          ? "Remessa criada sem movimentar estoque"
          : "Devolução criada; recebimento pendente",
      );
      onSaved(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function add() {
    const v = variants.data?.find((v) => v.id === variantId);
    if (!v) return;
    if (items.some((i) => i.variant_id === v.id && i.batch_id === (batchId || null))) {
      toast.error("Item/lote já adicionado; ajuste a quantidade.");
      return;
    }
    setItems((old) => [
      ...old,
      {
        key: crypto.randomUUID(),
        variant_id: v.id,
        batch_id: batchId || null,
        quantity: 1,
        condition: "SELLABLE",
        reason: "",
        label: v.label,
        barcode: null,
      },
    ]);
    setVariantId("");
    setBatchId("");
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{kind === "shipment" ? "Nova remessa" : "Nova devolução"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          {partner ? (
            <p>
              Parceiro: <strong>{partner.name}</strong>
            </p>
          ) : (
            <div>
              <Label>Parceiro</Label>
              <Input
                placeholder="Buscar empresa"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
              />
              <select
                className={cls}
                value={partnerId}
                required
                onChange={(e) => {
                  setPartnerId(e.target.value);
                  const c = companyRows.find((c) => c.partner_id === e.target.value);
                  if (kind === "shipment") setDestination(c?.default_inventory_location_id ?? "");
                  else setSource(c?.default_inventory_location_id ?? "");
                }}
              >
                <option value="">Selecione...</option>
                {companyRows
                  .filter((c) => c.partner_id)
                  .map((c) => (
                    <option key={c.id} value={c.partner_id!}>
                      {c.legal_name} ({c.status})
                    </option>
                  ))}
              </select>
            </div>
          )}
          {locations.isPending || variants.isPending ? <p>Carregando opções...</p> : null}
          {[locations.error, variants.error, companies.error, batches.error]
            .filter(Boolean)
            .map((e, i) => (
              <p key={i} className="text-destructive" role="alert">
                {e!.message}
              </p>
            ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Origem *</Label>
              <select
                className={cls}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {locations.data
                  ?.filter((l) =>
                    kind === "shipment" ? l.type !== "PARTNER" : l.partner_id === partnerId,
                  )
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Destino *</Label>
              <select
                className={cls}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {locations.data
                  ?.filter((l) =>
                    kind === "return" ? l.type !== "PARTNER" : l.partner_id === partnerId,
                  )
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}{" "}
                      {l.operational_purpose !== "NORMAL"
                        ? `(${l.operational_purpose === "QUARANTINE" ? "Quarentena" : "Inspeção"})`
                        : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                name="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
            {kind === "shipment" ? (
              <>
                <div>
                  <Label>Previsão de entrega</Label>
                  <Input type="date" name="expected_delivery_date" />
                </div>
                <Input
                  name="carrier_name"
                  aria-label="Transportadora"
                  placeholder="Transportadora"
                />
                <Input
                  name="tracking_code"
                  aria-label="Rastreio"
                  placeholder="Código de rastreio"
                />
              </>
            ) : null}
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <Label>Adicionar produto por nome, SKU ou barcode</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ou ler barcode"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (variants.data?.length === 1) setVariantId(variants.data[0].id);
                }
              }}
            />
            <select
              className={cls}
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                setBatchId("");
              }}
            >
              <option value="">Selecione variante...</option>
              {variants.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Lote"
              className={cls}
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">Sem lote</option>
              {batches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_code}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              On Hand na origem {batchId ? "do lote" : "total (inclui lotes)"}:{" "}
              {balance.isFetching ? "Consultando..." : (balance.data ?? "—")}. Saldo será revalidado
              ao confirmar.
            </p>
            <Button type="button" variant="outline" disabled={!variantId} onClick={add}>
              Adicionar item
            </Button>
          </div>
          {items.map((item, index) => (
            <div key={item.key} className="space-y-2 rounded-lg border p-3">
              <p>{item.label}</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  aria-label="Quantidade"
                  min="0.001"
                  step="0.001"
                  value={item.quantity}
                  required
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((i, n) =>
                        n === index ? { ...i, quantity: Number(e.target.value) } : i,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setItems((old) => old.filter((_, n) => n !== index))}
                >
                  Remover
                </Button>
              </div>
              {kind === "return" ? (
                <>
                  <select
                    className={cls}
                    aria-label="Condição"
                    value={item.condition}
                    onChange={(e) =>
                      setItems((old) =>
                        old.map((i, n) =>
                          n === index
                            ? { ...i, condition: e.target.value as Item["condition"] }
                            : i,
                        ),
                      )
                    }
                  >
                    {[
                      ["SELLABLE", "Vendável"],
                      ["DAMAGED", "Avariado"],
                      ["DEFECTIVE", "Defeituoso"],
                      ["OTHER", "Outro"],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Motivo da devolução *"
                    required
                    value={item.reason}
                    onChange={(e) =>
                      setItems((old) =>
                        old.map((i, n) => (n === index ? { ...i, reason: e.target.value } : i)),
                      )
                    }
                  />
                </>
              ) : null}
            </div>
          ))}
          <p>
            {items.length} itens/SKUs · {items.reduce((sum, i) => sum + i.quantity, 0)} unidades
          </p>
          {kind === "return" ? (
            <p className="text-sm">
              Itens avariados, defeituosos ou de outra condição exigem destino configurado como
              quarentena/inspeção. Crie devoluções separadas quando os destinos forem diferentes.
            </p>
          ) : null}
          <Label>Observações</Label>
          <Textarea name="notes" />
          {locations.error ||
          variants.error ||
          companies.error ||
          batches.error ||
          balance.error ? (
            <p role="alert" className="text-destructive">
              {locations.error?.message ??
                variants.error?.message ??
                companies.error?.message ??
                batches.error?.message ??
                balance.error?.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={mutation.isPending || !items.length || source === destination}>
              {mutation.isPending ? "Salvando..." : "Criar rascunho"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
