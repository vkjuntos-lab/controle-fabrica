import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Package, PackagePlus } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  productStatusLabel,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_STATUS_VALUES,
  type ProductStatus,
} from "@/lib/products/constants";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listCategories,
  listProducts,
  setProductStatus,
  updateProduct,
  type CategoryRow,
  type ProductDetail,
  type ProductListItem,
} from "@/lib/products/products.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({
    meta: [
      { title: "Catálogo de Produtos — Estratégia" },
      {
        name: "description",
        content: "Catálogo mestre de produtos, variantes e SKUs da fábrica.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProductsPage,
});

const PAGE_SIZE = 15;

function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  product: ProductDetail | null;
  categories: CategoryRow[] | undefined;
}) {
  const { currentOrganization } = useOrganization();
  const organizationId = currentOrganization?.organization_id;
  const create = useServerFn(createProduct);
  const update = useServerFn(updateProduct);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState<string>("NONE");
  const [ncm, setNcm] = useState("");
  const [status, setStatus] = useState<ProductStatus>("ACTIVE");
  const [mainImageUrl, setMainImageUrl] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode(product?.code ?? "");
    setName(product?.name ?? "");
    setBrand(product?.brand ?? "");
    setCategoryId(product?.category_id ?? "NONE");
    setNcm(product?.ncm ?? "");
    setStatus(product?.status ?? "ACTIVE");
    setMainImageUrl(product?.main_image_url ?? "");
    setDescription(product?.description ?? "");
  }, [open, product]);

  const saveMutation = useMutation({
    mutationFn: () =>
      organizationId
        ? product
          ? update({
              data: {
                organizationId,
                productId: product.id,
                name,
                description,
                categoryId: categoryId === "NONE" ? null : categoryId,
                brand,
                ncm,
                mainImageUrl,
              },
            })
          : create({
              data: {
                organizationId,
                code,
                name,
                description,
                categoryId: categoryId === "NONE" ? null : categoryId,
                brand,
                ncm,
                status,
                mainImageUrl,
              },
            })
        : Promise.reject(new Error("Nenhuma organização selecionada.")),
    onSuccess: () => {
      toast.success(product ? "Produto atualizado" : "Produto criado");
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Informe código e nome do produto");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? `Editar ${product.name}` : "Novo produto"}</DialogTitle>
          <DialogDescription>
            {product
              ? "O produto é o modelo; tamanho e cor entram como variantes (SKU)."
              : "Cadastre o modelo. As variantes (tamanho, cor, SKU) entram na página do produto."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-code">Código *</Label>
              <Input
                id="product-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex.: SAP-TAM-001"
                disabled={Boolean(product)}
                required
              />
              {product ? (
                <p className="text-xs text-muted-foreground">O código não é editável.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-status">Status</Label>
              {product ? (
                <div className="flex h-10 items-center">
                  <Badge>{productStatusLabel(product.status)}</Badge>
                </div>
              ) : (
                <Select value={status} onValueChange={(v) => setStatus(v as ProductStatus)}>
                  <SelectTrigger id="product-status">
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
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-name">Nome *</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Sapatilha Ballet Clássica"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-brand">Marca</Label>
              <Input
                id="product-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex.: Confort Pes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-ncm">NCM</Label>
              <Input
                id="product-ncm"
                value={ncm}
                onChange={(e) => setNcm(e.target.value)}
                placeholder="8 dígitos, como texto"
                maxLength={20}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-category">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="product-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Sem categoria</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-image">URL da imagem principal</Label>
            <Input
              id="product-image"
              type="url"
              value={mainImageUrl}
              onChange={(e) => setMainImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-description">Descrição</Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Salvando..."
                : product
                  ? "Salvar alterações"
                  : "Criar produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductsPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;

  const fetchProducts = useServerFn(listProducts);
  const fetchCategories = useServerFn(listCategories);
  const fetchProductDetail = useServerFn(getProduct);
  const changeStatus = useServerFn(setProductStatus);
  const removeProduct = useServerFn(deleteProduct);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<ProductStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ProductListItem | null>(null);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, status]);

  const productsQuery = useQuery({
    queryKey: ["products", organizationId, deferredQuery, status, page],
    queryFn: () =>
      fetchProducts({
        data: {
          organizationId: organizationId!,
          query: deferredQuery,
          status: status === "ALL" ? undefined : status,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    enabled: Boolean(organizationId),
  });

  const categoriesQuery = useQuery({
    queryKey: ["product-categories", organizationId],
    queryFn: () => fetchCategories({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  const detailQuery = useQuery({
    queryKey: ["product-detail", organizationId, editingId],
    queryFn: () =>
      fetchProductDetail({ data: { organizationId: organizationId!, productId: editingId! } }),
    enabled: Boolean(organizationId && dialogOpen && editingId),
    staleTime: 0,
  });

  const statusMutation = useMutation({
    mutationFn: (input: { productId: string; status: ProductStatus }) =>
      changeStatus({ data: { organizationId: organizationId!, ...input } }),
    onSuccess: () => {
      toast.success("Status atualizado");
      void productsQuery.refetch();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar o status", { description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) =>
      removeProduct({ data: { organizationId: organizationId!, productId } }),
    onSuccess: () => {
      toast.success("Produto excluído");
      setToDelete(null);
      void productsQuery.refetch();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível excluir", { description: error.message }),
  });

  const canManage = hasPermission(PERMISSIONS.productsManage);
  const data = productsQuery.data;

  return (
    <AppShell title="Operação · Catálogo de Produtos">
      {orgLoading ? (
        <LoadingState rows={4} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.productsRead) ? (
        <PermissionDenied permission={PERMISSIONS.productsRead} />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-lg font-semibold">Catálogo mestre</h2>
              <p className="text-sm text-muted-foreground">
                Modelos de produto e suas variantes (SKU). Este catálogo alimenta estoque,
                produção, marketplaces e vendas.
              </p>
            </div>
            {canManage ? (
              <Button
                onClick={() => {
                  setEditingId(null);
                  setDialogOpen(true);
                }}
              >
                <PackagePlus className="mr-2 h-4 w-4" />
                Novo produto
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Produtos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por código, nome ou marca..."
                  className="sm:max-w-sm"
                />
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as ProductStatus | "ALL")}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os status</SelectItem>
                    {PRODUCT_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {productStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground sm:ml-auto">
                  {data ? `${data.total} produto(s)` : ""}
                </p>
              </div>

              {productsQuery.isLoading ? (
                <LoadingState rows={5} />
              ) : productsQuery.error ? (
                <ErrorState
                  description={(productsQuery.error as Error).message}
                  onRetry={() => void productsQuery.refetch()}
                />
              ) : !data?.rows.length ? (
                <EmptyState
                  title="Nenhum produto encontrado"
                  description="Crie o primeiro produto do catálogo para começar."
                  icon={<Package className="h-8 w-8" />}
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead>Marca</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Variantes</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                                  {p.main_image_url ? (
                                    <img
                                      src={p.main_image_url}
                                      alt={p.name}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{p.name}</p>
                                  <p className="font-mono text-xs text-muted-foreground">
                                    {p.code}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{p.brand ?? "—"}</TableCell>
                            <TableCell>{p.category_name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  p.status === "ACTIVE"
                                    ? "default"
                                    : p.status === "INACTIVE"
                                      ? "secondary"
                                      : p.status === "DISCONTINUED"
                                        ? "destructive"
                                        : "outline"
                                }
                              >
                                {productStatusLabel(p.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{p.variant_count}</TableCell>
                            <TableCell className="text-right">
                              <Button asChild variant="outline" size="sm">
                                <a href={`/produtos/${p.id}`}>
                                  Variantes
                                  <ArrowRight className="ml-1 h-3 w-3" />
                                </a>
                              </Button>
                              {canManage ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="ml-1">
                                      Ações
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>{p.code}</DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditingId(p.id);
                                        setDialogOpen(true);
                                      }}
                                    >
                                      Editar dados
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        statusMutation.mutate({
                                          productId: p.id,
                                          status:
                                            p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                                        })
                                      }
                                    >
                                      {p.status === "ACTIVE" ? "Inativar" : "Ativar"}
                                    </DropdownMenuItem>
                                    {p.status !== "DISCONTINUED" ? (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          statusMutation.mutate({
                                            productId: p.id,
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
                                      disabled={p.variant_count > 0}
                                      onClick={() => setToDelete(p)}
                                    >
                                      {p.variant_count > 0 ? "Tem variantes — não exclui" : "Excluir"}
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

                  {data.total > PAGE_SIZE ? (
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
                        Página {data.page} de {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page * PAGE_SIZE >= data.total}
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

          <ProductDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            product={
              editingId
                ? detailQuery.isLoading
                  ? null
                  : (detailQuery.data ?? null)
                : null
            }
            categories={categoriesQuery.data}
          />

          <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                <AlertDialogDescription>
                  {toDelete
                    ? `"${toDelete.name}" (${toDelete.code}) será removido do catálogo. A exclusão só é
                    permitida para produtos sem variantes.`
                    : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
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