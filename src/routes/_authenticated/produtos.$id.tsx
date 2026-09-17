import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Package, Plus, ScanBarcode, Tag } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  formatBRL,
  formatWeight,
  productStatusLabel,
  PRODUCT_STATUS_OPTIONS,
  type ProductStatus,
  type ProductVariantStatus,
} from "@/lib/products/constants";
import {
  createVariant,
  deleteVariant,
  getProduct,
  setVariantStatus,
  updateVariant,
  type ProductVariant,
} from "@/lib/products/products.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/produtos/$id")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }, { title: "Produto — Estratégia" }] }),
  component: ProductDetailPage,
});

function toPrice(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed.replace(",", "."));
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function VariantDialog({
  open,
  onOpenChange,
  variant,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  variant: ProductVariant | null;
  onSaved: () => void;
}) {
  const { currentOrganization } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const routeParams = Route.useParams();
  const create = useServerFn(createVariant);
  const update = useServerFn(updateVariant);

  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [status, setStatus] = useState<ProductVariantStatus>("ACTIVE");

  useEffect(() => {
    if (!open) return;
    setSku(variant?.sku ?? "");
    setBarcode(variant?.barcode ?? "");
    setSize(variant?.size ?? "");
    setColor(variant?.color ?? "");
    setCostPrice(variant?.cost_price == null ? "" : String(variant.cost_price));
    setSellPrice(variant?.sell_price == null ? "" : String(variant.sell_price));
    setWeightGrams(variant?.weight_grams == null ? "" : String(variant.weight_grams));
    setStatus(variant?.status ?? "ACTIVE");
  }, [open, variant]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!organizationId) return Promise.reject(new Error("Nenhuma organização selecionada."));
      const payload = {
        organizationId,
        productId: routeParams.id,
        sku,
        barcode,
        size,
        color,
        costPrice: toPrice(costPrice),
        sellPrice: toPrice(sellPrice),
        weightGrams: toPrice(weightGrams),
      };
      return variant
        ? update({ data: { organizationId, variantId: variant.id, ...payload } })
        : create({ data: { ...payload, status } });
    },
    onSuccess: () => {
      toast.success(variant ? "Variante atualizada" : "Variante criada");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sku.trim()) {
      toast.error("Informe o SKU da variante");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{variant ? `Editar ${variant.sku}` : "Nova variante"}</DialogTitle>
          <DialogDescription>
            Cada combinação de tamanho/cor é uma variante com SKU próprio. Os preços aqui serão a
            base de vendas, custos e relatórios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="variant-sku">SKU *</Label>
              <Input
                id="variant-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex.: BAL-32-ROSA"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="variant-barcode">Código de barras (EAN/UPC)</Label>
              <Input
                id="variant-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Ex.: 7891234567890"
                maxLength={64}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="variant-size">Tamanho</Label>
              <Input
                id="variant-size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="Ex.: 32"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="variant-color">Cor</Label>
              <Input
                id="variant-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Ex.: Rosa"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="variant-cost">Custo (R$)</Label>
              <Input
                id="variant-cost"
                type="number"
                min={0}
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="variant-sell">Preço de venda (R$)</Label>
              <Input
                id="variant-sell"
                type="number"
                min={0}
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="variant-weight">Peso (g)</Label>
              <Input
                id="variant-weight"
                type="number"
                min={0}
                step="0.01"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                placeholder="Ex.: 350"
              />
            </div>
          </div>

          {!variant ? (
            <div className="space-y-2">
              <Label htmlFor="variant-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProductVariantStatus)}>
                <SelectTrigger id="variant-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : variant ? "Salvar alterações" : "Criar variante"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductDetailPage() {
  const { id } = Route.useParams();
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;

  const fetchProduct = useServerFn(getProduct);
  const changeVariantStatus = useServerFn(setVariantStatus);
  const removeVariant = useServerFn(deleteVariant);

  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [toDelete, setToDelete] = useState<ProductVariant | null>(null);

  const productQuery = useQuery({
    queryKey: ["product-detail", organizationId, id],
    queryFn: () => fetchProduct({ data: { organizationId: organizationId!, productId: id } }),
    enabled: Boolean(organizationId),
  });

  const invalidateAndRefetch = () => {
    void productQuery.refetch();
  };

  const statusMutation = useMutation({
    mutationFn: (input: { variantId: string; status: ProductVariantStatus }) =>
      changeVariantStatus({ data: { organizationId: organizationId!, ...input } }),
    onSuccess: () => {
      toast.success("Status da variante atualizado");
      void productQuery.refetch();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar", { description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (variantId: string) =>
      removeVariant({ data: { organizationId: organizationId!, variantId } }),
    onSuccess: () => {
      toast.success("Variante excluída");
      setToDelete(null);
      void productQuery.refetch();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível excluir", { description: error.message }),
  });

  const canManage = hasPermission(PERMISSIONS.productsManage);
  const product = productQuery.data;

  return (
    <AppShell title="Catálogo · Produto">
      {orgLoading ? (
        <LoadingState rows={3} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.productsRead) ? (
        <PermissionDenied permission={PERMISSIONS.productsRead} />
      ) : productQuery.isLoading ? (
        <LoadingState rows={4} />
      ) : productQuery.error ? (
        <ErrorState
          description={(productQuery.error as Error).message}
          onRetry={() => void productQuery.refetch()}
        />
      ) : !product ? (
        <EmptyState title="Produto não encontrado" />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/produtos">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Voltar ao catálogo
              </Link>
            </Button>
          </div>

          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
                  {product.main_image_url ? (
                    <img src={product.main_image_url} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-xl font-semibold">{product.name}</h2>
                    <Badge
                      variant={
                        product.status === "ACTIVE"
                          ? "default"
                          : product.status === "INACTIVE"
                            ? "secondary"
                            : product.status === "DISCONTINUED"
                              ? "destructive"
                              : "outline"
                      }
                    >
                      {productStatusLabel(product.status)}
                    </Badge>
                  </div>
                  <p className="font-mono text-sm text-muted-foreground">{product.code}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {product.brand ? <span>Marca: {product.brand}</span> : null}
                    {product.category ? <span>Categoria: {product.category.name}</span> : null}
                    {product.ncm ? <span>NCM: {product.ncm}</span> : null}
                    <span>{product.variants.length} variante(s)</span>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground sm:shrink-0">
                  <p>Criado em {new Date(product.created_at).toLocaleDateString("pt-BR")}</p>
                  <p>Atualizado em {new Date(product.updated_at).toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              {product.description ? (
                <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">
                  {product.description}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Variantes</CardTitle>
                <CardDescription>
                  Tamanho e cor vivem aqui — cada linha é uma unidade comercial com SKU próprio.
                </CardDescription>
              </div>
              {canManage ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingVariant(null);
                    setVariantDialogOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Nova variante
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {!product.variants.length ? (
                <EmptyState
                  title="Sem variantes ainda"
                  description="Adicione as combinações de tamanho, cor e SKU deste produto."
                  icon={<ScanBarcode className="h-8 w-8" />}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Código de barras</TableHead>
                        <TableHead>Tamanho</TableHead>
                        <TableHead>Cor</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Venda</TableHead>
                        <TableHead className="text-right">Peso</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {product.variants.map((variant) => (
                        <TableRow key={variant.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="font-mono font-medium">{variant.sku}</span>
                            </div>
                          </TableCell>
                          <TableCell>{variant.barcode ?? "—"}</TableCell>
                          <TableCell>{variant.size ?? "—"}</TableCell>
                          <TableCell>{variant.color ?? "—"}</TableCell>
                          <TableCell className="text-right">{formatBRL(variant.cost_price)}</TableCell>
                          <TableCell className="text-right">{formatBRL(variant.sell_price)}</TableCell>
                          <TableCell className="text-right">{formatWeight(variant.weight_grams)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                variant.status === "ACTIVE"
                                  ? "default"
                                  : variant.status === "INACTIVE"
                                    ? "secondary"
                                    : variant.status === "DISCONTINUED"
                                      ? "destructive"
                                      : "outline"
                              }
                            >
                              {productStatusLabel(variant.status as ProductStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    Ações
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>{variant.sku}</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingVariant(variant);
                                      setVariantDialogOpen(true);
                                    }}
                                  >
                                    Editar dados
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={variant.status === "DISCONTINUED"}
                                    onClick={() =>
                                      statusMutation.mutate({
                                        variantId: variant.id,
                                        status:
                                          variant.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                                      })
                                    }
                                  >
                                    {variant.status === "ACTIVE" ? "Inativar" : "Ativar"}
                                  </DropdownMenuItem>
                                  {variant.status !== "DISCONTINUED" ? (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        statusMutation.mutate({
                                          variantId: variant.id,
                                          status: "DISCONTINUED",
                                        })
                                      }
                                    >
                                      Descontinuar
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setToDelete(variant)}
                                  >
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <VariantDialog
            open={variantDialogOpen}
            onOpenChange={setVariantDialogOpen}
            variant={editingVariant}
            onSaved={invalidateAndRefetch}
          />

          <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir variante?</AlertDialogTitle>
                <AlertDialogDescription>
                  {toDelete
                    ? `A variante "${toDelete.sku}" será removida. Isso não apaga o produto "${product.name}".`
                    : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onSelect={(e) => e.preventDefault()}
                  onClick={() => {
                    if (toDelete) deleteMutation.mutate(toDelete.id);
                  }}
                >
                  {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AppShell>
  );
}