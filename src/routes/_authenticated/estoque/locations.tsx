import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatQuantity,
  LOCATION_STATUS_OPTIONS,
  LOCATION_TYPE_OPTIONS,
  locationStatusLabel,
  locationTypeLabel,
  type LocationStatus,
  type LocationType,
} from "@/lib/inventory/constants";
import {
  createInventoryLocation,
  getInventorySettings,
  listInventoryLocations,
  updateInventoryLocation,
  updateInventorySettings,
  type InventoryLocationRow,
} from "@/lib/inventory/inventory.functions";
import { useOrganization } from "@/lib/org/org-context";
import { queryPartners } from "@/lib/partners/partners.functions";
import type { PartnerList, CompanyRow } from "@/lib/partners/types";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/estoque/locations")({
  head: () => ({
    meta: [
      { title: "Localizações de estoque — Estratégia" },
      { name: "description", content: "Fábrica, depósitos, lojas e parceiros." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LocationsPage,
});

function LocationDialog({
  open,
  onOpenChange,
  location,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  location: InventoryLocationRow | null;
}) {
  const { currentOrganization, hasPermission } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();
  const create = useServerFn(createInventoryLocation);
  const update = useServerFn(updateInventoryLocation);

  const queryPartnersFn = useServerFn(queryPartners);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<"NORMAL" | "QUARANTINE" | "INSPECTION">("NORMAL");
  const partners = useQuery({
    queryKey: ["partners", "location-options", organizationId, partnerSearch],
    queryFn: async () =>
      (await queryPartnersFn({
        data: {
          organizationId: organizationId!,
          kind: "companies",
          filters: { query: partnerSearch },
        },
      })) as PartnerList,
    enabled: open && Boolean(organizationId) && hasPermission("partners.read"),
  });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("WAREHOUSE");
  const [status, setStatus] = useState<LocationStatus>("ACTIVE");

  useEffect(() => {
    if (!open) return;
    setCode(location?.code ?? "");
    setPartnerId(location?.partner_id ?? null);
    setPurpose(location?.operational_purpose ?? "NORMAL");
    setName(location?.name ?? "");
    setType(location?.type ?? "WAREHOUSE");
    setStatus(location?.status ?? "ACTIVE");
  }, [open, location]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Nenhuma organização selecionada.");
      if (location) {
        await update({
          data: {
            organizationId,
            locationId: location.id,
            name,
            type,
            status,
            operationalPurpose: purpose,
            partnerId,
          },
        });
        return;
      }
      await create({
        data: { organizationId, code, name, type, operationalPurpose: purpose, partnerId },
      });
    },
    onSuccess: () => {
      toast.success(location ? "Localização atualizada" : "Localização criada");
      void queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || (!location && !code.trim())) {
      toast.error("Informe código e nome");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{location ? "Editar localização" : "Nova localização"}</DialogTitle>
          <DialogDescription>
            A localização é a posição física/operacional da mercadoria (fábrica, depósito, loja,
            parceiro, trânsito).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location-code">Código *</Label>
            <Input
              id="location-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex.: FABRICA-01"
              disabled={Boolean(location)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location-name">Nome *</Label>
            <Input
              id="location-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Fábrica Matriz"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as LocationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {location ? (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as LocationStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Finalidade operacional</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="QUARANTINE">Quarentena / avaria</SelectItem>
                <SelectItem value="INSPECTION">Inspeção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "PARTNER" ? (
            <div className="space-y-2">
              <Label>Empresa parceira</Label>
              {location?.partner_id ? (
                <p className="text-sm text-muted-foreground">
                  Vínculo preservado: {location.partner_id}
                </p>
              ) : (
                <>
                  <Input
                    placeholder="Buscar empresa"
                    value={partnerSearch}
                    onChange={(e) => setPartnerSearch(e.target.value)}
                  />
                  <select
                    aria-label="Empresa parceira"
                    className="h-10 w-full rounded border bg-background px-3"
                    value={partnerId ?? ""}
                    onChange={(e) => setPartnerId(e.target.value || null)}
                  >
                    <option value="">Sem vínculo</option>
                    {((partners.data?.rows ?? []) as CompanyRow[])
                      .filter((p) => p.partner_id)
                      .map((p) => (
                        <option value={p.partner_id!} key={p.id}>
                          {p.legal_name}
                        </option>
                      ))}
                  </select>
                  {partners.error ? <p role="alert">{partners.error.message}</p> : null}
                </>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : location ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LocationsPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();

  const fetchLocations = useServerFn(listInventoryLocations);
  const fetchSettings = useServerFn(getInventorySettings);
  const saveSettings = useServerFn(updateInventorySettings);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryLocationRow | null>(null);

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations", organizationId, "all"],
    queryFn: () => fetchLocations({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  const settingsQuery = useQuery({
    queryKey: ["inventory-settings", organizationId],
    queryFn: () => fetchSettings({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  const settingsMutation = useMutation({
    mutationFn: (allowNegativeInventory: boolean) =>
      saveSettings({ data: { organizationId: organizationId!, allowNegativeInventory } }),
    onSuccess: () => {
      toast.success("Configuração atualizada");
      void queryClient.invalidateQueries({ queryKey: ["inventory-settings"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  const canManage = hasPermission(PERMISSIONS.inventoryManageLocations);

  return (
    <AppShell title="Estoque · Localizações">
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
              <h2 className="font-heading text-lg font-semibold">Localizações</h2>
              <p className="text-sm text-muted-foreground">
                Cada posição de estoque pertence a uma localização.
              </p>
            </div>
            {canManage ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova localização
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Localizações cadastradas</CardTitle>
            </CardHeader>
            <CardContent>
              {locationsQuery.isLoading ? (
                <LoadingState rows={4} />
              ) : locationsQuery.error ? (
                <ErrorState
                  description={(locationsQuery.error as Error).message}
                  onRetry={() => void locationsQuery.refetch()}
                />
              ) : !locationsQuery.data?.length ? (
                <EmptyState
                  title="Nenhuma localização"
                  description="Cadastre a fábrica, depósitos, lojas e parceiros."
                  icon={<MapPin className="h-8 w-8" />}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Localização</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Saldo total</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locationsQuery.data.map((location) => (
                        <TableRow key={location.id}>
                          <TableCell>
                            <p className="font-medium">{location.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {location.code}
                            </p>
                          </TableCell>
                          <TableCell>
                            {locationTypeLabel(location.type)} ·{" "}
                            {
                              {
                                NORMAL: "Normal",
                                QUARANTINE: "Quarentena",
                                INSPECTION: "Inspeção",
                              }[location.operational_purpose]
                            }
                          </TableCell>
                          <TableCell>
                            <Badge variant={location.status === "ACTIVE" ? "default" : "secondary"}>
                              {locationStatusLabel(location.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatQuantity(location.on_hand_total)}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditing(location);
                                  setDialogOpen(true);
                                }}
                              >
                                Editar
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regras de estoque</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Permitir saldo negativo</p>
                  <p className="text-xs text-muted-foreground">
                    Quando desativado, saídas que deixariam o saldo negativo são rejeitadas.
                  </p>
                </div>
                <Switch
                  checked={settingsQuery.data?.allow_negative_inventory ?? false}
                  disabled={!canManage || settingsQuery.isLoading}
                  onCheckedChange={(checked) => settingsMutation.mutate(checked)}
                />
              </div>
            </CardContent>
          </Card>

          <LocationDialog open={dialogOpen} onOpenChange={setDialogOpen} location={editing} />
        </>
      )}
    </AppShell>
  );
}
