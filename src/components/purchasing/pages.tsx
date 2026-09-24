import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, EmptyState, ErrorState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useOrganization } from "@/lib/org/org-context";
import {
  saveCompany,
  saveSupplierProduct,
  querySuppliers,
  saveRequest,
  requestAction,
  queryRequests,
  saveQuotation,
  awardQuotation,
  queryQuotations,
  savePurchaseOrder,
  purchaseOrderAction,
  queryPurchaseOrders,
  receivePurchaseOrder,
  receiptAction,
  queryReceipts,
  saveReturn,
  returnAction,
  queryReturns,
  saveDocument,
  documentAction,
  queryDocuments,
  exceptionAction,
  queryExceptions,
  queryReplenishment,
  queryPurchasing,
  savePurchasingSettings,
} from "@/lib/purchasing/purchasing.functions";
import type {
  DocumentList,
  ExceptionList,
  GoodsReceiptDetail,
  OrderCandidates,
  OrderList,
  PurchaseOrderDetail,
  PurchaseOrderItemRow,
  PurchasingDashboard,
  PurchasingSettings,
  QuotationDetail,
  QuotationList,
  ReceiptList,
  ReplenishmentResult,
  RequestList,
  ReturnList,
  SupplierDetail,
  SupplierDocumentRow,
  SupplierList,
  SupplierProductsList,
  SupplierReturnRow,
} from "@/lib/purchasing/types";
import { listInventoryLocations, listVariantOptions, type VariantOption } from "@/lib/inventory/inventory.functions";
import { formatDate, formatDateTime, formatMoney } from "@/lib/finance/constants";

const cls = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export function PurchasingNavigation() {
  return (
    <nav className="flex flex-wrap gap-2 print:hidden">
      {[
        ["/compras", "Visão geral"],
        ["/fornecedores", "Fornecedores"],
        ["/compras/requisicoes", "Requisições"],
        ["/compras/cotacoes", "Cotações"],
        ["/compras/pedidos", "Pedidos"],
        ["/compras/recebimentos", "Recebimentos"],
        ["/compras/devolucoes", "Devoluções"],
        ["/compras/documentos", "Documentos"],
        ["/compras/excecoes", "Exceções"],
        ["/compras/reposicao", "Reposição"],
      ].map(([to, label]) => (
        <Button key={to} variant="outline" asChild>
          <a href={to}>{label}</a>
        </Button>
      ))}
    </nav>
  );
}

const STATUS_CSS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  SUBMITTED: "bg-sky-50 text-sky-700 border-sky-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SENT: "bg-blue-50 text-blue-700 border-blue-200",
  RECEIVING: "bg-cyan-50 text-cyan-700 border-cyan-200",
  ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  POSTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UNDER_INSPECTION: "bg-amber-50 text-amber-700 border-amber-200",
  ORDERED: "bg-violet-50 text-violet-700 border-violet-200",
  AWAITING: "bg-amber-50 text-amber-700 border-amber-200",
  AWARDED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MATCHED: "bg-blue-50 text-blue-700 border-blue-200",
  EXCEPTION: "bg-orange-50 text-orange-700 border-orange-200",
  PROCESSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IN_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IGNORED_WITH_AUTHORIZATION: "bg-purple-50 text-purple-700 border-purple-200",
  OPEN: "bg-red-50 text-red-700 border-red-200",
  WARNING: "bg-amber-50 text-amber-700 border-amber-200",
  BLOCKING: "bg-red-50 text-red-700 border-red-200",
  INACTIVE: "bg-zinc-100 text-zinc-600 border-zinc-200",
  BLOCKED: "bg-red-50 text-red-700 border-red-200",
  CANCELED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function PStatus({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={`border ${STATUS_CSS[status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function useVariants(org: string | undefined, enabled: boolean) {
  const fetch = useServerFn(listVariantOptions);
  return useQuery({
    queryKey: ["purchasing", "variants", org],
    queryFn: async () => (await fetch({ data: { organizationId: org!, activeOnly: true } })) as VariantOption[],
    enabled: Boolean(org && enabled),
  });
}

function useLocations(org: string | undefined, enabled: boolean) {
  const fetch = useServerFn(listInventoryLocations);
  return useQuery({
    queryKey: ["purchasing", "locations", org],
    queryFn: async () => (await fetch({ data: { organizationId: org!, active: true } as never })) as {
      id: string;
      code: string;
      name: string;
      type: string;
      status: string;
      on_hand_total: number;
    }[],
    enabled: Boolean(org && enabled),
  });
}

function useSuppliers(org: string | undefined, enabled: boolean) {
  const fetch = useServerFn(querySuppliers);
  const q = useQuery({
    queryKey: ["purchasing", "suppliers", org],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "suppliers", filters: {}, page: 1 },
      })) as SupplierList,
    enabled: Boolean(org && enabled),
  });
  return q;
}

function useSuppliersFlat(org: string | undefined, enabled: boolean) {
  const q = useSuppliers(org, enabled);
  return (q.data?.rows ?? []).map((s) => ({
    id: s.supplier_id,
    name: s.legal_name,
    code: s.supplier_code,
  }));
}

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title: string;
  description?: string;
};

function FormDialog({ open, onOpenChange, children, title, description }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ItemEditor({
  values,
  onChange,
  variants,
  withPrice,
  withSku,
  withSupplier,
  suppliers,
  lines,
  setLines,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  variants: VariantOption[];
  withPrice: boolean;
  withSku?: boolean;
  withSupplier?: boolean;
  suppliers: { id: string; name: string }[];
  lines: Record<string, string>[];
  setLines: (lines: Record<string, string>[]) => void;
}) {
  const field = (name: string) => {
    const candidate = lines[lines.length - 1]?.[name];
    return typeof candidate === "string" ? candidate : "";
  };
  void field;
  return (
    <div className="space-y-3">
      {withSupplier ? (
        <select className={cls} value={values.supplier_id ?? ""} onChange={(e) => onChange("supplier_id", e.target.value)}>
          <option value="">Fornecedor</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}
      {withSku ? (
        <Input
          placeholder="SKU do fornecedor"
          value={values.supplier_sku ?? ""}
          onChange={(e) => onChange("supplier_sku", e.target.value)}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <select className={cls} value={values.variant_id ?? ""} onChange={(e) => onChange("variant_id", e.target.value)}>
          <option value="">Variante</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.sku} — {v.product_name}
            </option>
          ))}
        </select>
        <Input
          className="w-28"
          type="number"
          min={0}
          step="0.01"
          placeholder="Qtd"
          value={values.quantity ?? ""}
          onChange={(e) => onChange("quantity", e.target.value)}
        />
        {withPrice ? (
          <Input
            className="w-28"
            type="number"
            min={0}
            step="0.01"
            placeholder="Preço"
            value={values.unit_price ?? ""}
            onChange={(e) => onChange("unit_price", e.target.value)}
          />
        ) : null}
        <Input
          className="min-w-40 flex-1"
          placeholder="Motivo"
          value={values.reason ?? ""}
          onChange={(e) => onChange("reason", e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const line: Record<string, string> = {};
            for (const key of ["supplier_id", "supplier_sku", "variant_id", "quantity", "unit_price", "reason"]) {
              const v = values[key];
              if (key !== "supplier_sku" && v && String(v).trim()) line[key] = String(v);
              if (key === "supplier_sku" && v) line[key] = String(v);
            }
            if (!line.variant_id || !line.quantity || (withPrice && !line.unit_price)) {
              toast.error("Preencha variante e quantidade antes de adicionar o item.");
              return;
            }
            setLines([...lines, line]);
            const next: Record<string, string> = {};
            for (const key of Object.keys(values)) next[key] = key === "supplier_id" ? values.supplier_id : "";
            onChange("supplier_id", values.supplier_id ?? "");
            Object.entries(next).forEach(([k, val]) => {
              if (k !== "supplier_id") onChange(k, val);
            });
          }}
        >
          Adicionar
        </Button>
      </div>
      {lines.length ? (
        <Card>
          <CardContent className="pt-4">
            <ul className="space-y-1 text-sm">
              {lines.map((line, i) => {
                const v = variants.find((x) => x.id === line.variant_id);
                const label = v ? `${v.sku} — ${v.product_name}` : line.variant_id;
                return (
                  <li key={i} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0">
                    <span>
                      {label} · {line.quantity}
                      {line.unit_price ? ` × R$ ${line.unit_price}` : ""}
                      {line.reason ? ` — ${line.reason}` : ""}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      remover
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/* ============================================================
 * Visão geral (dashboard)
 * ============================================================ */
export function PurchasingDashboardPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryPurchasing);
  const can = hasPermission("purchasing.read");
  const canDashboard = hasPermission("purchasing.dashboard");
  const q = useQuery({
    queryKey: ["purchasing", "dashboard", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "dashboard" } })) as PurchasingDashboard,
    enabled: Boolean(org && can && canDashboard),
  });
  const d = q.data;
  return (
    <AppShell title="Compras · Visão geral">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="purchasing.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : d ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <a href="/fornecedores" className="rounded border p-3 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Fornecedores ativos</p>
            <p className="text-xl font-semibold">{d.active_suppliers}</p>
          </a>
          <a href="/compras/requisicoes" className="rounded border p-3 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Requisições aprovadas</p>
            <p className="text-xl font-semibold">{d.open_requests}</p>
          </a>
          <a href="/compras/pedidos" className="rounded border p-3 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Pedidos em aprovação</p>
            <p className="text-xl font-semibold">{d.pending_approval}</p>
          </a>
          <a href="/compras/pedidos" className="rounded border p-3 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Valor em pedidos abertos</p>
            <p className="text-xl font-semibold">{formatMoney(d.orders_amount)}</p>
          </a>
          <a href="/compras/recebimentos" className="rounded border p-3 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Recebimentos hoje</p>
            <p className="text-xl font-semibold">{d.receipts_today}</p>
          </a>
          <a href="/compras/excecoes" className="rounded border border-red-200 bg-red-50 p-3 hover:bg-red-100">
            <p className="text-sm text-red-700">Exceções em aberto</p>
            <p className="text-xl font-semibold">{d.open_exceptions}</p>
          </a>
          <a href="/compras/reposicao" className="rounded border p-3 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Candidatas à reposição</p>
            <p className="text-xl font-semibold">{d.replenishment_candidates}</p>
          </a>
        </div>
      ) : null}
    </AppShell>
  );
}

/* ============================================================
 * Fornecedores
 * ============================================================ */
export function FornecedoresPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const q = useSuppliers(org, hasPermission("suppliers.read"));
  const canManage = hasPermission("suppliers.manage");
  useEffect(() => {
    if (!open) {
      const f = q.refetch;
      void f();
    }
  }, [q, open]);
  const filters = { query, status };
  const rows = (q.data?.rows ?? []).filter(
    (s) =>
      (!query ||
        `${s.code} ${s.legal_name} ${s.trade_name ?? ""} ${s.supplier_code} ${s.document_number ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!status || s.supplier_status === status),
  );
  return (
    <AppShell title="Compras · Fornecedores">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission("suppliers.read") ? (
        <PermissionDenied permission="suppliers.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Fornecedores</h2>
            {canManage ? (
              <Button onClick={() => setOpen(true)}>Novo fornecedor</Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Input
              className="min-w-48 flex-1"
              placeholder="Buscar por nome, código ou documento"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
              <option value="BLOCKED">Bloqueado</option>
            </select>
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={q.data?.total === 0 ? "Nenhum fornecedor cadastrado" : "Nada com esses filtros"}
              description="Cadastre empresas fornecedoras e seus catálogos."
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Empresa</th>
                        <th className="pb-2 pr-4">Código</th>
                        <th className="pb-2 pr-4 text-right">Produtos</th>
                        <th className="pb-2 pr-4 text-right">Pedidos</th>
                        <th className="pb-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.supplier_id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-4">
                            <a href={`/fornecedores/${s.supplier_id}`} className="font-medium underline">
                              {s.legal_name}
                            </a>
                            {s.trade_name ? <p className="text-muted-foreground">{s.trade_name}</p> : null}
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">{s.supplier_code}</td>
                          <td className="py-2 pr-4 text-right">{s.product_count}</td>
                          <td className="py-2 pr-4 text-right">{s.open_orders}</td>
                          <td className="py-2 pr-4">
                            <PStatus status={s.supplier_status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {open ? (
            <SupplierDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["purchasing", "suppliers"] });
                setOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function SupplierDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const vfetch = useServerFn(listVariantOptions);
  const variants = useQuery({
    queryKey: ["purchasing", "variants", organizationId],
    queryFn: async () =>
      (await vfetch({ data: { organizationId, activeOnly: true } })) as VariantOption[],
  });
  const [company, setCompany] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Record<string, string>[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      const companyId = await saveCompany({
        data: { organizationId, data: company as never },
      });
      for (const p of products) {
        await saveSupplierProduct({
          data: { organizationId, data: { ...p, supplier_id: companyId } as never },
        });
      }
    },
    onSuccess: () => {
      toast.success("Fornecedor cadastrado.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setCompany((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Novo fornecedor">
      <div className="grid gap-3 md:grid-cols-2">
        <Input placeholder="Código *" value={company.code ?? ""} onChange={(e) => set("code", e.target.value)} />
        <Input placeholder="Razão social *" value={company.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} />
        <Input placeholder="Nome fantasia" value={company.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} />
        <Input placeholder="CNPJ" value={company.document_number ?? ""} onChange={(e) => set("document_number", e.target.value)} />
        <Input placeholder="E-mail" value={company.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        <Input placeholder="Telefone" value={company.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        <Input placeholder="Condições (ex.: 30/60)" value={company.default_payment_terms ?? ""} onChange={(e) => set("default_payment_terms", e.target.value)} />
        <Input placeholder="Prazo de entrega (dias)" type="number" min={0} value={company.lead_time_days ?? ""} onChange={(e) => set("lead_time_days", e.target.value)} />
      </div>
      <h3 className="pt-2 font-medium">Catálogo de produtos</h3>
      <ItemEditor
        values={company}
        onChange={set}
        variants={variants.data ?? []}
        withPrice={false}
        withSku
        suppliers={[]}
        lines={products}
        setLines={setProducts}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

export function FornecedorDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(querySuppliers);
  const productsFetch = useServerFn(saveSupplierProduct);
  const qc = useQueryClient();
  const [openProduct, setOpenProduct] = useState(false);
  const canRead = hasPermission("suppliers.read");
  const canManage = hasPermission("suppliers.manage");
  const q = useQuery({
    queryKey: ["purchasing", "supplier", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "supplier", filters: { company_id: id }, page: 1 },
      })) as SupplierDetail,
    enabled: Boolean(org && canRead),
  });
  const prodq = useQuery({
    queryKey: ["purchasing", "supplier-products", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "products", filters: { supplier_id: id }, page: 1 },
      })) as SupplierProductsList,
    enabled: Boolean(org && canRead),
  });
  return (
    <AppShell title="Compras · Fornecedor">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="suppliers.read" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">
              {q.data.legal_name}
              <span className="ml-2 align-middle">
                <PStatus status={q.data.status} />
              </span>
            </h2>
            {canManage ? (
              <Button
                variant="outline"
                onClick={() => {
                  void saveCompany({
                    data: {
                      organizationId: org,
                      data: {
                        code: (q.data.profile as { supplier_code?: string } | null)?.supplier_code ?? q.data.code,
                        legal_name: q.data.legal_name,
                        trade_name: q.data.trade_name ?? "",
                        email: (q.data.email as string | null) ?? "",
                        phone: (q.data.phone as string | null) ?? "",
                      },
                    },
                  });
                  toast.success("Fornecedor atualizado.");
                }}
              >
                Salvar alterações
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Documento</p>
              <p className="font-mono text-sm">{q.data.document_number ?? "—"}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Produtos no catálogo</p>
              <p className="text-xl font-semibold">{prodq.data?.rows.length ?? 0}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Pedidos</p>
              <p className="text-xl font-semibold">{(q.data.orders ?? []).length}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Catálogo de produtos</h3>
            {canManage ? (
              <Button onClick={() => setOpenProduct(true)}>Adicionar produto ao catálogo</Button>
            ) : null}
          </div>
          {prodq.error ? (
            <ErrorState description={prodq.error.message} onRetry={() => void prodq.refetch()} />
          ) : (prodq.data?.rows ?? []).length === 0 ? (
            <EmptyState title="Nenhum produto no catálogo" />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">SKU do fornecedor</th>
                        <th className="pb-2 pr-4">Produto</th>
                        <th className="pb-2 pr-4">Unidades</th>
                        <th className="pb-2 pr-4 text-right">Fator</th>
                        <th className="pb-2 pr-4 text-right">Último preço</th>
                        <th className="pb-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(prodq.data?.rows ?? []).map((p) => (
                        <tr key={p.id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-4 font-mono text-xs">{p.supplier_sku}</td>
                          <td className="py-2 pr-4">
                            {p.product_name} <span className="text-muted-foreground">({p.sku})</span>
                          </td>
                          <td className="py-2 pr-4 text-xs">
                            {p.purchase_unit ?? "?"} → {p.inventory_unit ?? "?"}
                          </td>
                          <td className="py-2 pr-4 text-right">{p.conversion_factor}</td>
                          <td className="py-2 pr-4 text-right">
                            {p.last_price == null ? "—" : formatMoney(p.last_price)}
                          </td>
                          <td className="py-2 pr-4">
                            <PStatus status={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <h3 className="font-medium">Histórico</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Pedidos</p>
                {(q.data.orders ?? []).length === 0 ? (
                  <p className="text-sm">Vazio.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {(q.data.orders ?? []).slice(0, 5).map((o) => (
                      <li key={o.id}>
                        <a href={`/compras/pedidos/${o.id}`} className="underline">
                          {o.order_number}
                        </a>{" "}
                        · {formatMoney(o.total_amount)} · <PStatus status={o.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Recebimentos</p>
                {(q.data.receipts ?? []).length === 0 ? (
                  <p className="text-sm">Vazio.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {(q.data.receipts ?? []).slice(0, 5).map((r) => (
                      <li key={r.id}>
                        <a href={`/compras/recebimentos/${r.id}`} className="underline">
                          {r.receipt_number}
                        </a>{" "}
                        · <PStatus status={r.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Documentos</p>
                {(q.data.documents ?? []).length === 0 ? (
                  <p className="text-sm">Vazio.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {(q.data.documents ?? []).slice(0, 5).map((doc) => (
                      <li key={doc.id}>
                        <a href="/compras/documentos" className="underline">
                          {doc.document_number}
                        </a>{" "}
                        · <PStatus status={doc.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Devoluções</p>
                {(q.data.returns ?? []).length === 0 ? (
                  <p className="text-sm">Vazio.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {(q.data.returns ?? []).slice(0, 5).map((ret) => (
                      <li key={ret.id}>
                        <a href="/compras/devolucoes" className="underline">
                          {ret.return_number}
                        </a>{" "}
                        · <PStatus status={ret.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          {openProduct ? (
            <SupplierProductDialog
              organizationId={org}
              supplierId={id}
              onClose={() => setOpenProduct(false)}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["purchasing", "supplier-products", org, id] });
                void qc.invalidateQueries({ queryKey: ["purchasing", "suppliers", org] });
                setOpenProduct(false);
              }}
            />
          ) : null}
          <div className="hidden">
            {productsFetch.method}
          </div>
        </>
      )}
    </AppShell>
  );
}

function SupplierProductDialog({
  organizationId,
  supplierId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const variants = useVariants(organizationId, true);
  const [form, setForm] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () =>
      await saveSupplierProduct({
        data: { organizationId, data: { ...form, supplier_id: supplierId } as never },
      }),
    onSuccess: () => {
      toast.success("Produto adicionado ao catálogo.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Produto do fornecedor">
      <div className="grid gap-3 md:grid-cols-2">
        <select className={cls} value={form.variant_id ?? ""} onChange={(e) => set("variant_id", e.target.value)}>
          <option value="">Variante</option>
          {(variants.data ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.sku} — {v.product_name}
            </option>
          ))}
        </select>
        <Input placeholder="SKU do fornecedor *" value={form.supplier_sku ?? ""} onChange={(e) => set("supplier_sku", e.target.value)} />
        <Input placeholder="Descrição do fornecedor" value={form.supplier_description ?? ""} onChange={(e) => set("supplier_description", e.target.value)} />
        <Input
          placeholder="Fator de conversão"
          type="number"
          min={0.0001}
          step="0.0001"
          value={form.conversion_factor ?? ""}
          onChange={(e) => set("conversion_factor", e.target.value)}
        />
        <Input placeholder="Preço de referência" type="number" min={0} step="0.01" value={form.last_price ?? ""} onChange={(e) => set("last_price", e.target.value)} />
        <Input placeholder="Qtd. mínima do pedido" type="number" min={0} step="0.01" value={form.minimum_order_quantity ?? ""} onChange={(e) => set("minimum_order_quantity", e.target.value)} />
        <Input placeholder="Prazo de entrega (dias)" type="number" min={0} value={form.lead_time_days ?? ""} onChange={(e) => set("lead_time_days", e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">
        Deixe as unidades e o fator em branco para herdar os padrões (1 para fator). A conversão é usada no
        recebimento: por exemplo, rolo → m com fator 5.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

/* ============================================================
 * Requisições de compra
 * ============================================================ */
export function RequisicoesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryRequests);
  const act = useServerFn(requestAction);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("purchase_requests.read");
  const canCreate = hasPermission("purchase_requests.create");
  const canApprove = hasPermission("purchase_requests.approve");
  const filters = { query, status };
  const q = useQuery({
    queryKey: ["purchasing", "requests", org, filters],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "requests", filters, page: 1 },
      })) as RequestList,
    enabled: Boolean(org && canRead),
  });
  const run = (id: string, action: "submit" | "approve" | "cancel") =>
    act
      .mutateAsync({ data: { organizationId: org!, requestId: id, action, data: { reason: "Usuário" } } })
      .then(() => {
        toast.success("Requisição atualizada.");
        void qc.invalidateQueries({ queryKey: ["purchasing", "requests", org] });
        void qc.invalidateQueries({ queryKey: ["purchasing", "dashboard", org] });
      })
      .catch((e: Error) => toast.error(e.message));
  return (
    <AppShell title="Compras · Requisições">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="purchase_requests.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Requisições de compra</h2>
            {canCreate ? <Button onClick={() => setOpen(true)}>Nova requisição</Button> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Input className="min-w-48 flex-1" placeholder="Buscar número" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "CANCELED"].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : (q.data?.rows ?? []).length === 0 ? (
            <EmptyState title="Nenhuma requisição" description="Crie uma requisição de compra para iniciar o fluxo." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Número</th>
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2 pr-4">Prioridade</th>
                        <th className="pb-2 pr-4 text-right">Itens</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(q.data?.rows ?? []).map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-4 font-mono text-xs">{r.request_number}</td>
                          <td className="py-2 pr-4">{formatDate(r.request_date)}</td>
                          <td className="py-2 pr-4">{r.priority}</td>
                          <td className="py-2 pr-4 text-right">{r.items}</td>
                          <td className="py-2 pr-4">
                            <PStatus status={r.status} />
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              {r.status === "DRAFT" && canCreate ? (
                                <Button size="sm" variant="outline" className="h-7" onClick={() => void run(r.id, "submit")}>
                                  Enviar
                                </Button>
                              ) : null}
                              {r.status === "SUBMITTED" && canApprove ? (
                                <Button size="sm" variant="outline" className="h-7" onClick={() => void run(r.id, "approve")}>
                                  Aprovar
                                </Button>
                              ) : null}
                              {r.status !== "ORDERED" && r.status !== "CANCELED" && canCreate ? (
                                <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => void run(r.id, "cancel")}>
                                  Cancelar
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {open ? (
            <RequestDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["purchasing", "requests", org] });
                void qc.invalidateQueries({ queryKey: ["purchasing", "dashboard", org] });
                setOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function RequestDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const variants = useVariants(organizationId, true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Record<string, string>[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      const id = await saveRequest({
        data: {
          organizationId,
          data: {
            priority: (form.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT") ?? "NORMAL",
            notes: form.notes,
            items: lines as never,
          },
        },
      });
      await requestAction({
        data: { organizationId, requestId: id as never, action: "submit", data: {} },
      });
    },
    onSuccess: () => {
      toast.success("Requisição criada e enviada para aprovação.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Nova requisição de compra">
      <div className="grid gap-3 md:grid-cols-2">
        <select className={cls} value={form.priority ?? "NORMAL"} onChange={(e) => set("priority", e.target.value)}>
          <option value="LOW">Baixa</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">Alta</option>
          <option value="URGENT">Urgente</option>
        </select>
        <Input placeholder="Observações" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <ItemEditor
        values={form}
        onChange={set}
        variants={variants.data ?? []}
        withPrice={false}
        suppliers={[]}
        lines={lines}
        setLines={setLines}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || lines.length === 0}>
          Criar e enviar
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

/* ============================================================
 * Cotações
 * ============================================================ */
export function CotacoesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryQuotations);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("quotations.read");
  const canCreate = hasPermission("quotations.create");
  const filters = { query, status };
  const q = useQuery({
    queryKey: ["purchasing", "quotations", org, filters],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "quotations", filters, page: 1 },
      })) as QuotationList,
    enabled: Boolean(org && canRead),
  });
  return (
    <AppShell title="Compras · Cotações">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="quotations.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Cotações</h2>
            {canCreate ? <Button onClick={() => setOpen(true)}>Nova cotação</Button> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Input className="min-w-48 flex-1" placeholder="Buscar número" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {["DRAFT", "AWAITING", "AWARDED"].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : (q.data?.rows ?? []).length === 0 ? (
            <EmptyState title="Nenhuma cotação" description="Crie uma cotação para comparar fornecedores." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Número</th>
                        <th className="pb-2 pr-4">Requisição</th>
                        <th className="pb-2 pr-4 text-right">Fornecedores</th>
                        <th className="pb-2 pr-4 text-right">Variantes</th>
                        <th className="pb-2 pr-4">Prazo</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(q.data?.rows ?? []).map((co) => (
                        <TableQuotationRow key={co.id} quotationId={co.id} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <p className="text-sm text-muted-foreground">
            Use as linhas abaixo para premiar fornecedores por item (requer permissão de premiação).
          </p>
          {open ? (
            <QuotationDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["purchasing", "quotations", org] });
                setOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function TableQuotationRow({ quotationId }: { quotationId: string }) {
  const { currentOrganization } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryQuotations);
  const q = useQuery<QuotationList>({
    queryKey: ["purchasing", "quotations", org, "row", quotationId],
    queryFn: async () => {
      const detail = (await fetch({
        data: { organizationId: org!, kind: "quotation", filters: { id: quotationId }, page: 1 },
      })) as QuotationDetail;
      const suppliers = detail.suppliers.map((s) => s.supplier_id).length;
      const variants = new Set(detail.items.map((i) => i.variant_id)).size;
      return {
        total: 1,
        rows: [
          {
            id: quotationId,
            quotation_number: String((detail.quotation as { quotation_number?: string }).quotation_number ?? quotationId),
            status: String((detail.quotation as { status?: string }).status ?? "DRAFT"),
            deadline: (detail.quotation as { deadline?: string | null }).deadline ?? null,
            created_at: "",
            purchase_request_id: (detail.quotation as { purchase_request_id?: string | null }).purchase_request_id ?? null,
            request_number: "",
            suppliers,
            variants,
          },
        ],
      };
    },
    enabled: Boolean(org),
  });
  const row = q.data?.rows[0];
  if (!row) return <tr><td className="py-2">…</td></tr>;
  return (
    <tr className="border-b hover:bg-muted/40">
      <td className="py-2 pr-4 font-mono text-xs">{row.quotation_number}</td>
      <td className="py-2 pr-4">{row.request_number || "—"}</td>
      <td className="py-2 pr-4 text-right">{row.suppliers}</td>
      <td className="py-2 pr-4 text-right">{row.variants}</td>
      <td className="py-2 pr-4">{row.deadline ? formatDate(row.deadline) : "—"}</td>
      <td className="py-2 pr-4"><PStatus status={row.status} /></td>
      <td className="py-2">
        <a href={`/compras/cotacoes/${quotationId}`} className="text-sm underline">
          Abrir
        </a>
      </td>
    </tr>
  );
}

function QuotationDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const variants = useVariants(organizationId, true);
  const suppliers = useSuppliersFlat(organizationId, true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Record<string, string>[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      if (!lines.length) throw new Error("Adicione ao menos um item.");
      const grouped = new Map<string, Record<string, string>[]>();
      for (const line of lines) {
        const key = line.supplier_id ?? "";
        if (!key) throw new Error("Informe o fornecedor em cada linha.");
        grouped.set(key, [...(grouped.get(key) ?? []), line]);
      }
      const suppliersData = [...grouped.entries()].map(([supplier_id, items]) => ({
        supplier_id,
        items: items.map((i) => ({
          variant_id: i.variant_id,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        })),
      }));
      await saveQuotation({
        data: { organizationId, data: { deadline: form.deadline, suppliers: suppliersData } },
      });
    },
    onSuccess: () => {
      toast.success("Cotação criada.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Nova cotação">
      <div className="grid gap-3 md:grid-cols-1">
        <Input placeholder="Prazo (AAAA-MM-DD)" value={form.deadline ?? ""} onChange={(e) => set("deadline", e.target.value)} />
      </div>
      <ItemEditor
        values={form}
        onChange={set}
        variants={variants.data ?? []}
        withPrice
        withSupplier
        suppliers={suppliers}
        lines={lines}
        setLines={setLines}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Criar
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

export function CotacaoDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryQuotations);
  const qc = useQueryClient();
  const [award, setAward] = useState<Record<string, string>>({});
  const canAward = hasPermission("quotations.award");
  const q = useQuery({
    queryKey: ["purchasing", "quotation", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "quotation", filters: { id }, page: 1 },
      })) as QuotationDetail,
    enabled: Boolean(org && hasPermission("quotations.read")),
  });
  const awardFn = useServerFn(awardQuotation);
  const submitAward = useMutation({
    mutationFn: async () => {
      const items = Object.entries(award)
        .filter(([, supplier]) => supplier)
        .map(([variant, supplier]) => ({ variant_id: variant, supplier_id: supplier, award: true }));
      if (!items.length) throw new Error("Selecione pelo menos um fornecedor premiado.");
      await awardFn({ data: { organizationId: org!, quotationId: id as never, data: { items } } });
    },
    onSuccess: () => {
      toast.success("Premiação registrada.");
      void qc.invalidateQueries({ queryKey: ["purchasing", "quotation", org] });
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const data = q.data;
  const detail = data?.quotation as { quotation_number?: string; status?: string; deadline?: string | null };
  const variants = [...new Map((data?.items ?? []).map((i) => [i.variant_id, i])).values()];
  return (
    <AppShell title="Compras · Cotação">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <>
          <h2 className="font-heading text-xl font-semibold">
            {detail?.quotation_number} <PStatus status={detail?.status ?? null} />
          </h2>
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Produto</th>
                      <th className="pb-2 pr-4">Fornecedor</th>
                      <th className="pb-2 pr-4 text-right">Qtd</th>
                      <th className="pb-2 pr-4 text-right">Preço</th>
                      <th className="pb-2 pr-4 text-right">Total</th>
                      <th className="pb-2 pr-4">Prêmio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items ?? []).map((i) => (
                      <tr key={i.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-4">
                          {i.product_name} <span className="text-muted-foreground">({i.sku})</span>
                        </td>
                        <td className="py-2 pr-4">{i.supplier_name}</td>
                        <td className="py-2 pr-4 text-right">{formatNumber(i.quantity)}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(i.unit_price)}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(i.total_amount)}</td>
                        <td className="py-2 pr-4">
                          {i.awarded ? (
                            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">Premiado</Badge>
                          ) : canAward ? (
                            <select
                              className={cls}
                              value={award[i.variant_id] === i.supplier_id ? award[i.variant_id] : ""}
                              onChange={(e) => setAward((prev) => ({ ...prev, [i.variant_id]: e.target.value }))}
                            >
                              <option value="">Selecionar</option>
                              {(data.suppliers ?? []).map((s) => (
                                <option key={s.supplier_id} value={s.supplier_id}>
                                  {s.supplier_name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          {canAward ? (
            <Button onClick={() => submitAward.mutate()} disabled={submitAward.isPending}>
              Registrar premiação
            </Button>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

/* ============================================================
 * Pedidos de compra
 * ============================================================ */
export function PedidosPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryPurchaseOrders);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("purchase_orders.read");
  const canCreate = hasPermission("purchase_orders.create");
  const qc = useQueryClient();
  const filters = { query, status };
  const q = useQuery({
    queryKey: ["purchasing", "orders", org, filters],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "orders", filters, page: 1 },
      })) as OrderList,
    enabled: Boolean(org && canRead),
  });
  const rows = (q.data?.rows ?? []).filter(
    (o) =>
      (!query || `${o.order_number} ${o.supplier_name} ${o.supplier_code}`.toLowerCase().includes(query.toLowerCase())) &&
      (!status || o.status === status),
  );
  return (
    <AppShell title="Compras · Pedidos">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="purchase_orders.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Pedidos de compra</h2>
            {canCreate ? <Button onClick={() => setOpen(true)}>Novo pedido</Button> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Input className="min-w-48 flex-1" placeholder="Buscar número ou fornecedor" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "RECEIVING", "COMPLETED", "CANCELED"].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhum pedido" description="Emita um pedido de compra para um fornecedor." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Pedido</th>
                        <th className="pb-2 pr-4">Fornecedor</th>
                        <th className="pb-2 pr-4">Emissão</th>
                        <th className="pb-2 pr-4 text-right">Total</th>
                        <th className="pb-2 pr-4 text-right">Itens</th>
                        <th className="pb-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((po) => (
                        <tr key={po.id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-4">
                            <a href={`/compras/pedidos/${po.id}`} className="font-mono text-xs underline">
                              {po.order_number}
                            </a>
                          </td>
                          <td className="py-2 pr-4">{po.supplier_name}</td>
                          <td className="py-2 pr-4">{formatDate(po.issue_date)}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(po.total_amount)}</td>
                          <td className="py-2 pr-4 text-right">
                            {po.status === "DRAFT" ? po.items : <>{po.open_items > 0 ? <span className="text-amber-600">{po.open_items}</span> : "0"} / {po.items}</>}
                          </td>
                          <td className="py-2 pr-4">
                            <PStatus status={po.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {open ? (
            <OrderDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                void qcInvalidateOrders(qc, org);
                setOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function qcInvalidateOrders(qc: QueryClient, org: string | undefined) {
  void qc.invalidateQueries({ queryKey: ["purchasing", "orders", org] });
  void qc.invalidateQueries({ queryKey: ["purchasing", "dashboard", org] });
}

function OrderDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const variants = useVariants(organizationId, true);
  const suppliers = useSuppliersFlat(organizationId, true);
  const locations = useLocations(organizationId, true);
  const candidates = useQuery({
    queryKey: ["purchasing", "po-candidates", organizationId],
    queryFn: async () =>
      (await queryPurchaseOrders({
        data: { organizationId, kind: "candidates", filters: {}, page: 1 },
      })) as OrderCandidates,
    enabled: Boolean(organizationId),
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Record<string, string>[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      await savePurchaseOrder({
        data: {
          organizationId,
          data: {
            supplier_id: form.supplier_id!,
            payment_terms: form.payment_terms,
            destination_location_id: form.destination_location_id,
            expected_delivery_date: form.expected_delivery_date,
            freight_amount: form.freight_amount ? Number(form.freight_amount) : undefined,
            items: lines.map((l) => ({
              variant_id: l.variant_id,
              ordered_quantity: Number(l.quantity),
              unit_price: Number(l.unit_price),
            })),
          } as never,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pedido criado em rascunho.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Novo pedido de compra">
      <div className="grid gap-3 md:grid-cols-2">
        <select className={cls} value={form.supplier_id ?? ""} onChange={(e) => set("supplier_id", e.target.value)}>
          <option value="">Fornecedor *</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className={cls} value={form.destination_location_id ?? ""} onChange={(e) => set("destination_location_id", e.target.value)}>
          <option value="">Local de destino</option>
          {(locations.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <Input placeholder="Condições (30/60)" value={form.payment_terms ?? ""} onChange={(e) => set("payment_terms", e.target.value)} />
        <Input placeholder="Entrega esperada (AAAA-MM-DD)" value={form.expected_delivery_date ?? ""} onChange={(e) => set("expected_delivery_date", e.target.value)} />
        <Input placeholder="Frete (R$)" type="number" min={0} step="0.01" value={form.freight_amount ?? ""} onChange={(e) => set("freight_amount", e.target.value)} />
      </div>
      <ItemEditor
        values={form}
        onChange={set}
        variants={variants.data ?? []}
        withPrice
        suppliers={[]}
        lines={lines}
        setLines={setLines}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.supplier_id || lines.length === 0}>
          Salvar rascunho
        </Button>
      </DialogFooter>
      {(candidates.data?.rows ?? []).length ? (
        <p className="text-sm text-muted-foreground">
          Há pedidos aprovados aguardando conciliação de documento em{" "}
          <a href="/compras/documentos" className="underline">
            Documentos
          </a>
          .
        </p>
      ) : null}
    </FormDialog>
  );
}

export function PedidoDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryPurchaseOrders);
  const [openReceive, setOpenReceive] = useState(false);
  const q = useQuery({
    queryKey: ["purchasing", "order", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "order", filters: { id }, page: 1 },
      })) as PurchaseOrderDetail,
    enabled: Boolean(org && hasPermission("purchase_orders.read")),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["purchasing", "order", org] });
    void qc.invalidateQueries({ queryKey: ["purchasing", "orders", org] });
    void qc.invalidateQueries({ queryKey: ["purchasing", "receipts", org] });
    void qc.invalidateQueries({ queryKey: ["purchasing", "dashboard", org] });
    void q.refetch();
  };
  const run = (action: "submit" | "approve" | "send" | "cancel") =>
    purchaseOrderAction({ data: { organizationId: org!, purchaseOrderId: id as never, action, data: { reason: "Usuário" } } })
      .then(() => {
        toast.success("Pedido atualizado.");
        refresh();
      })
      .catch((e: Error) => toast.error(e.message));
  const data = q.data;
  const order = data?.order as {
    order_number?: string;
    status?: string;
    supplier_id?: string;
    supplier_name?: string;
    total_amount?: number;
    payment_terms?: string | null;
    expected_delivery_date?: string | null;
    notes?: string | null;
  };
  const canSubmit = hasPermission("purchase_orders.create");
  const canApprove = hasPermission("purchase_orders.approve");
  const canSend = hasPermission("purchase_orders.send");
  const canCancel = hasPermission("purchase_orders.cancel");
  const canReceive = hasPermission("goods_receipts.create");
  return (
    <AppShell title="Compras · Pedido">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">
              {order?.order_number} <PStatus status={order?.status ?? null} />
            </h2>
            <div className="flex flex-wrap gap-2">
              {order?.status === "DRAFT" && canSubmit ? (
                <Button onClick={() => void run("submit")}>Submeter</Button>
              ) : null}
              {order?.status === "PENDING_APPROVAL" && canApprove ? (
                <Button onClick={() => void run("approve")}>Aprovar</Button>
              ) : null}
              {order?.status === "APPROVED" && canSend ? (
                <Button onClick={() => void run("send")}>Marcar enviado</Button>
              ) : null}
              {["PENDING_APPROVAL", "APPROVED", "SENT", "RECEIVING"].includes(order?.status ?? "") && canReceive ? (
                <Button onClick={() => setOpenReceive(true)}>Registrar recebimento</Button>
              ) : null}
              {!["COMPLETED", "CANCELED"].includes(order?.status ?? "") && canCancel ? (
                <Button variant="outline" className="text-destructive" onClick={() => void run("cancel")}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Fornecedor</p>
              <p className="font-medium">{(order as { supplier_name?: string }).supplier_name ?? "—"}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-xl font-semibold">{formatMoney(order?.total_amount ?? 0)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Condições</p>
              <p>{order?.payment_terms ?? "—"}</p>
              {order?.expected_delivery_date ? (
                <p className="text-sm text-muted-foreground">Entrega {formatDate(order.expected_delivery_date)}</p>
              ) : null}
            </div>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Produto</th>
                      <th className="pb-2 pr-4 text-right">Pedido</th>
                      <th className="pb-2 pr-4 text-right">Recebido</th>
                      <th className="pb-2 pr-4 text-right">Preço</th>
                      <th className="pb-2 pr-4 text-right">Total</th>
                      <th className="pb-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items ?? []).map((i: PurchaseOrderItemRow) => (
                      <tr key={i.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-4">
                          {i.product_name} <span className="text-muted-foreground">({i.sku})</span>
                        </td>
                        <td className="py-2 pr-4 text-right">{formatNumber(i.ordered_quantity)}</td>
                        <td className="py-2 pr-4 text-right">{formatNumber(i.received_quantity)}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(i.unit_price)}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(i.line_total)}</td>
                        <td className="py-2 pr-4">
                          <PStatus status={i.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          {data.receipts?.length ? (
            <>
              <h3 className="font-medium">Recebimentos</h3>
              <Card>
                <CardContent className="pt-4">
                  <ul className="space-y-1 text-sm">
                    {(data.receipts as { id: string; receipt_number: string; status: string; received_at: string }[]).map((gr) => (
                      <li key={gr.id}>
                        <a href={`/compras/recebimentos/${gr.id}`} className="underline">
                          {gr.receipt_number}
                        </a>{" "}
                        · {formatDate(gr.received_at)} · <PStatus status={gr.status} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : null}
          {openReceive ? (
            <ReceiveDialog
              organizationId={org}
              purchaseOrderId={id}
              onClose={() => setOpenReceive(false)}
              onSaved={() => {
                setOpenReceive(false);
                refresh();
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function ReceiveDialog({
  organizationId,
  purchaseOrderId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  purchaseOrderId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const variants = useVariants(organizationId, true);
  const locations = useLocations(organizationId, true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Record<string, string>[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      if (!lines.length) throw new Error("Informe ao menos um item recebido.");
      const receiptId = await receivePurchaseOrder({
        data: {
          organizationId,
          purchaseOrderId: purchaseOrderId as never,
          data: {
            received_at: form.received_at,
            destination_location_id: form.destination_location_id,
            items: lines.map((l) => ({ variant_id: l.variant_id, quantity: Number(l.quantity) })),
          },
        },
      });
      toast.success("Recebimento criado. Inspecione antes de postar.");
      void onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Registrar recebimento">
      <div className="grid gap-3 md:grid-cols-2">
        <Input placeholder="Data (AAAA-MM-DD)" value={form.received_at ?? ""} onChange={(e) => set("received_at", e.target.value)} />
        <select className={cls} value={form.destination_location_id ?? ""} onChange={(e) => set("destination_location_id", e.target.value)}>
          <option value="">Local de entrada</option>
          {(locations.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </select>
      </div>
      <ItemEditor
        values={form}
        onChange={set}
        variants={variants.data ?? []}
        withPrice={false}
        suppliers={[]}
        lines={lines}
        setLines={setLines}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || lines.length === 0}>
          Criar recebimento
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

/* ============================================================
 * Recebimentos
 * ============================================================ */
export function RecebimentosPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReceipts);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const canRead = hasPermission("goods_receipts.read");
  const filters = { query, status };
  const q = useQuery({
    queryKey: ["purchasing", "receipts", org, filters],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "receipts", filters, page: 1 },
      })) as ReceiptList,
    enabled: Boolean(org && canRead),
  });
  const rows = (q.data?.rows ?? []).filter(
    (r) =>
      (!query ||
        `${r.receipt_number} ${r.supplier_name} ${r.order_number}`.toLowerCase().includes(query.toLowerCase())) &&
      (!status || r.status === status),
  );
  return (
    <AppShell title="Compras · Recebimentos">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="goods_receipts.read" />
      ) : (
        <>
          <h2 className="font-heading text-xl font-semibold">Recebimentos</h2>
          <div className="flex flex-wrap gap-3">
            <Input className="min-w-48 flex-1" placeholder="Buscar número, fornecedor ou pedido" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {["DRAFT", "UNDER_INSPECTION", "ACCEPTED", "REJECTED", "POSTED", "CANCELED"].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhum recebimento" description="Recebimentos aparecem após registrar entrada de um pedido." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Recebimento</th>
                        <th className="pb-2 pr-4">Pedido</th>
                        <th className="pb-2 pr-4">Fornecedor</th>
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2 pr-4 text-right">Aceito</th>
                        <th className="pb-2 pr-4 text-right">Rejeitado</th>
                        <th className="pb-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-4">
                            <a href={`/compras/recebimentos/${r.id}`} className="font-mono text-xs underline">
                              {r.receipt_number}
                            </a>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">{r.order_number}</td>
                          <td className="py-2 pr-4">{r.supplier_name}</td>
                          <td className="py-2 pr-4">{formatDate(r.received_at)}</td>
                          <td className="py-2 pr-4 text-right">{formatNumber(r.total_accepted)}</td>
                          <td className="py-2 pr-4 text-right">{formatNumber(r.total_rejected)}</td>
                          <td className="py-2 pr-4">
                            <PStatus status={r.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}

export function RecebimentoDetailPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryReceipts);
  const [openInspect, setOpenInspect] = useState(false);
  const q = useQuery({
    queryKey: ["purchasing", "receipt", org, id],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "receipt", filters: { id }, page: 1 },
      })) as GoodsReceiptDetail,
    enabled: Boolean(org && hasPermission("goods_receipts.read")),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["purchasing", "receipt", org] });
    void qc.invalidateQueries({ queryKey: ["purchasing", "receipts", org] });
    void qc.invalidateQueries({ queryKey: ["purchasing", "orders", org] });
    void qc.invalidateQueries({ queryKey: ["purchasing", "dashboard", org] });
    void qc.invalidateQueries({ queryKey: ["inventory", "movements"] });
    void q.refetch();
  };
  const run = (action: "post" | "cancel") =>
    receiptAction({ data: { organizationId: org!, goodsReceiptId: id as never, action, data: {} } })
      .then(() => {
        toast.success("Recebimento atualizado.");
        refresh();
      })
      .catch((e: Error) => toast.error(e.message));
  const data = q.data;
  const receipt = data?.receipt as {
    receipt_number?: string;
    status?: string;
    received_at?: string;
    supplier_name?: string;
    order_number?: string;
    total_accepted?: number;
    total_rejected?: number;
  };
  const items = data?.items ?? [];
  const status = receipt?.status;
  const canInspect = hasPermission("goods_receipts.inspect");
  const canPost = hasPermission("goods_receipts.post");
  const canCancel = hasPermission("goods_receipts.cancel");
  return (
    <AppShell title="Compras · Recebimento">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : q.error ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">
              {receipt?.receipt_number} <PStatus status={status ?? null} />
            </h2>
            <div className="flex flex-wrap gap-2">
              {status === "DRAFT" && canInspect ? (
                <Button onClick={() => setOpenInspect(true)}>Inspecionar</Button>
              ) : null}
              {["ACCEPTED", "REJECTED", "UNDER_INSPECTION"].includes(status ?? "") && canPost ? (
                <Button onClick={() => void run("post")}>Postar (gera custo e estoque)</Button>
              ) : null}
              {!["POSTED", "CANCELED"].includes(status ?? "") && canCancel ? (
                <Button variant="outline" className="text-destructive" onClick={() => void run("cancel")}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Pedido</p>
              <p>{receipt?.order_number ?? "—"}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Data</p>
              <p>{receipt?.received_at ? formatDate(receipt.received_at) : "—"}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Aceito / Rejeitado</p>
              <p>
                {formatNumber(receipt?.total_accepted ?? 0)} / {formatNumber(receipt?.total_rejected ?? 0)}
              </p>
            </div>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Produto</th>
                      <th className="pb-2 pr-4 text-right">Recebido</th>
                      <th className="pb-2 pr-4 text-right">Aceito</th>
                      <th className="pb-2 pr-4 text-right">Rejeitado</th>
                      <th className="pb-2 pr-4 text-right">Custo unit.</th>
                      <th className="pb-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-4">
                          {i.product_name} <span className="text-muted-foreground">({i.sku})</span>
                        </td>
                        <td className="py-2 pr-4 text-right">{formatNumber(i.received_quantity)}</td>
                        <td className="py-2 pr-4 text-right">{formatNumber(i.accepted_quantity)}</td>
                        <td className="py-2 pr-4 text-right">{formatNumber(i.rejected_quantity)}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(i.unit_cost)}</td>
                        <td className="py-2 pr-4">
                          <PStatus status={i.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            A postagem gera entrada de estoque, aplica a política de custo definida em configurações e, se
            configurado, cria as obrigações financeiras do pedido.
          </p>
          {openInspect ? (
            <InspectDialog
              organizationId={org}
              receiptId={id}
              items={items}
              onClose={() => setOpenInspect(false)}
              onSaved={() => {
                setOpenInspect(false);
                refresh();
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function InspectDialog({
  organizationId,
  receiptId,
  items,
  onClose,
  onSaved,
}: {
  organizationId: string;
  receiptId: string;
  items: GoodsReceiptDetail["items"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      const payload = items.map((i) => ({
        item_id: i.id,
        accepted_quantity: Number(accepted[i.id] ?? i.received_quantity),
        reason: reasons[i.id],
      }));
      await receiptAction({
        data: { organizationId, goodsReceiptId: receiptId as never, action: "inspect", data: { items: payload } as never },
      });
      toast.success("Inspeção registrada. Poste para gerar estoque e custo.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Inspecionar recebimento">
      <div className="grid gap-3">
        {items.map((i) => (
          <div key={i.id} className="grid gap-2 md:grid-cols-2">
            <p className="text-sm">
              {i.product_name} <span className="text-muted-foreground">({i.sku})</span> — recebido {formatNumber(i.received_quantity)}
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-28"
                placeholder="Aceitar"
                value={accepted[i.id] ?? String(i.received_quantity)}
                onChange={(e) => setAccepted((prev) => ({ ...prev, [i.id]: e.target.value }))}
              />
              <Input placeholder="Motivo de recusa (opcional)" value={reasons[i.id] ?? ""} onChange={(e) => setReasons((prev) => ({ ...prev, [i.id]: e.target.value }))} />
            </div>
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Confirmar inspeção
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

/* ============================================================
 * Devoluções a fornecedor
 * ============================================================ */
export function DevolucoesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryReturns);
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("supplier_returns.read");
  const canCreate = hasPermission("supplier_returns.create");
  const q = useQuery({
    queryKey: ["purchasing", "returns", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "returns", filters: {}, page: 1 } })) as ReturnList,
    enabled: Boolean(org && canRead),
  });
  const post = useMutation({
    mutationFn: async (id: string) =>
      await returnAction({ data: { organizationId: org!, returnId: id as never, action: "post", data: {} } }),
    onSuccess: () => {
      toast.success("Devolução postada (saída de estoque).");
      void qc.invalidateQueries({ queryKey: ["purchasing", "returns", org] });
      void qc.invalidateQueries({ queryKey: ["inventory", "movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = q.data?.rows ?? [];
  return (
    <AppShell title="Compras · Devoluções">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="supplier_returns.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Devoluções a fornecedores</h2>
            {canCreate ? <Button onClick={() => setOpen(true)}>Nova devolução</Button> : null}
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhuma devolução" description="Devoluções saem do estoque com tipo PURCHASE_RETURN." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Devolução</th>
                        <th className="pb-2 pr-4">Fornecedor</th>
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2 pr-4 text-right">Itens</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <DevRow key={r.id} row={r} onPost={() => post.mutate(r.id)} canPost={hasPermission("supplier_returns.post")} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {open ? (
            <ReturnDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["purchasing", "returns", org] });
                setOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function DevRow({
  row,
  onPost,
  canPost,
}: {
  row: SupplierReturnRow;
  onPost: () => void;
  canPost: boolean;
}) {
  return (
    <tr className="border-b hover:bg-muted/40">
      <td className="py-2 pr-4 font-mono text-xs">{row.return_number}</td>
      <td className="py-2 pr-4">{row.supplier_name}</td>
      <td className="py-2 pr-4">{formatDate(row.return_date)}</td>
      <td className="py-2 pr-4 text-right">{row.items}</td>
      <td className="py-2 pr-4">
        <PStatus status={row.status} />
      </td>
      <td className="py-2">
        {row.status === "DRAFT" && canPost ? (
          <Button size="sm" variant="outline" className="h-7" onClick={onPost}>
            Postar
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function ReturnDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const variants = useVariants(organizationId, true);
  const suppliers = useSuppliersFlat(organizationId, true);
  const locations = useLocations(organizationId, true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Record<string, string>[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      if (!lines.length) throw new Error("Adicione ao menos um item.");
      await saveReturn({
        data: {
          organizationId,
          data: {
            supplier_id: form.supplier_id!,
            source_location_id: form.source_location_id,
            reason: form.reason,
            items: lines.map((l) => ({ variant_id: l.variant_id, quantity: Number(l.quantity), reason: l.reason })),
          } as never,
        },
      });
      toast.success("Devolução criada como rascunho.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Nova devolução a fornecedor">
      <div className="grid gap-3 md:grid-cols-2">
        <select className={cls} value={form.supplier_id ?? ""} onChange={(e) => set("supplier_id", e.target.value)}>
          <option value="">Fornecedor *</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className={cls} value={form.source_location_id ?? ""} onChange={(e) => set("source_location_id", e.target.value)}>
          <option value="">Local de origem *</option>
          {(locations.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <Input placeholder="Motivo geral" value={form.reason ?? ""} onChange={(e) => set("reason", e.target.value)} />
      </div>
      <ItemEditor
        values={form}
        onChange={set}
        variants={variants.data ?? []}
        withPrice={false}
        suppliers={[]}
        lines={lines}
        setLines={setLines}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.supplier_id || lines.length === 0}>
          Salvar rascunho
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

/* ============================================================
 * Documentos de fornecedor (3-way match)
 * ============================================================ */
export function DocumentosPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryDocuments);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const canRead = hasPermission("supplier_documents.read");
  const canCreate = hasPermission("supplier_documents.create");
  const filters = { query, status };
  const q = useQuery({
    queryKey: ["purchasing", "documents", org, filters],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, kind: "documents", filters, page: 1 },
      })) as DocumentList,
    enabled: Boolean(org && canRead),
  });
  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "match" | "process" }) =>
      await documentAction({
        data: { organizationId: org!, documentId: id as never, action, data: {} },
      }),
    onSuccess: (_d, { action }) => {
      toast.success(action === "process" ? "Documento processado." : "Documento conciliado.");
      void qc.invalidateQueries({ queryKey: ["purchasing", "documents", org] });
      void qc.invalidateQueries({ queryKey: ["purchasing", "exceptions", org] });
      void qc.invalidateQueries({ queryKey: ["purchasing", "dashboard", org] });
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = (q.data?.rows ?? []).filter(
    (d) =>
      (!query ||
        `${d.document_number} ${d.supplier_name} ${d.order_number ?? ""}`.toLowerCase().includes(query.toLowerCase())) &&
      (!status || d.status === status),
  );
  const canMatch = hasPermission("supplier_documents.create");
  const canProcess = hasPermission("supplier_documents.process");
  return (
    <AppShell title="Compras · Documentos de fornecedor">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="supplier_documents.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Documentos de fornecedor</h2>
            {canCreate ? <Button onClick={() => setOpen(true)}>Novo documento</Button> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Input className="min-w-48 flex-1" placeholder="Buscar número" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {["DRAFT", "MATCHED", "EXCEPTION", "PROCESSED", "CANCELED"].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhum documento" description="Faturas e notas são conciliadas contra o pedido de compra." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Documento</th>
                        <th className="pb-2 pr-4">Fornecedor</th>
                        <th className="pb-2 pr-4">Pedido</th>
                        <th className="pb-2 pr-4 text-right">Valor</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => (
                        <DocRow
                          key={d.id}
                          row={d}
                          canMatch={canMatch}
                          canProcess={canProcess}
                          onAction={(action) => act.mutate({ id: d.id, action })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {open ? (
            <DocumentDialog
              organizationId={org}
              onClose={() => setOpen(false)}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["purchasing", "documents", org] });
                setOpen(false);
              }}
            />
          ) : null}
          <p className="text-sm text-muted-foreground">
            Conciliar compara fatura × pedido × recebimento e levanta exceções de preço (PRICE_VARIANCE) e
            quantidade (QUANTITY_VARIANCE). Exceções bloqueiam o processamento até resolução.
          </p>
        </>
      )}
    </AppShell>
  );
}

function DocRow({
  row,
  canMatch,
  canProcess,
  onAction,
}: {
  row: SupplierDocumentRow;
  canMatch: boolean;
  canProcess: boolean;
  onAction: (action: "match" | "process") => void;
}) {
  const can = canMatch || canProcess;
  void can;
  return (
    <tr className="border-b hover:bg-muted/40">
      <td className="py-2 pr-4">
        <span className="font-mono text-xs">{row.document_number}</span>
        <p className="text-xs text-muted-foreground">{row.document_type}</p>
      </td>
      <td className="py-2 pr-4">{row.supplier_name}</td>
      <td className="py-2 pr-4 font-mono text-xs">{row.order_number ?? "—"}</td>
      <td className="py-2 pr-4 text-right">{formatMoney(row.total_amount)}</td>
      <td className="py-2 pr-4">
        <PStatus status={row.status} />
        {row.open_exceptions > 0 ? (
          <a href="/compras/excecoes" className="ml-2 text-xs text-orange-600 underline">
            {row.open_exceptions} exceção(ões)
          </a>
        ) : null}
      </td>
      <td className="py-2">
        <div className="flex flex-wrap gap-1">
          {row.status === "DRAFT" && canMatch ? (
            <Button size="sm" variant="outline" className="h-7" onClick={() => onAction("match")}>
              Conciliar
            </Button>
          ) : null}
          {row.status === "MATCHED" && canProcess ? (
            <Button size="sm" variant="outline" className="h-7" onClick={() => onAction("process")}>
              Processar
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function DocumentDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const suppliers = useSuppliersFlat(organizationId, true);
  const candidates = useQuery({
    queryKey: ["purchasing", "doc-candidates", organizationId],
    queryFn: async () =>
      (await queryPurchaseOrders({
        data: { organizationId, kind: "candidates", filters: {}, page: 1 },
      })) as OrderCandidates,
    enabled: Boolean(organizationId),
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      await saveDocument({
        data: {
          organizationId,
          data: {
            supplier_id: form.supplier_id!,
            document_type: (form.document_type ?? "INVOICE") as "INVOICE",
            document_number: form.document_number!,
            issue_date: form.issue_date,
            total_amount: form.total_amount ? Number(form.total_amount) : undefined,
            quantity: form.quantity ? Number(form.quantity) : undefined,
            purchase_order_id: form.purchase_order_id,
          } as never,
        },
      });
      toast.success("Documento criado. Concilie contra o pedido.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Novo documento de fornecedor">
      <div className="grid gap-3 md:grid-cols-2">
        <select className={cls} value={form.supplier_id ?? ""} onChange={(e) => set("supplier_id", e.target.value)}>
          <option value="">Fornecedor *</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Input placeholder="Número do documento *" value={form.document_number ?? ""} onChange={(e) => set("document_number", e.target.value)} />
        <select className={cls} value={form.document_type ?? "INVOICE"} onChange={(e) => set("document_type", e.target.value)}>
          <option value="INVOICE">Fatura</option>
          <option value="CREDIT_NOTE">Nota de crédito</option>
          <option value="OTHER">Outro</option>
        </select>
        <Input placeholder="Data (AAAA-MM-DD)" value={form.issue_date ?? ""} onChange={(e) => set("issue_date", e.target.value)} />
        <Input placeholder="Valor total" type="number" min={0} step="0.01" value={form.total_amount ?? ""} onChange={(e) => set("total_amount", e.target.value)} />
        <Input placeholder="Quantidade" type="number" min={0} step="0.01" value={form.quantity ?? ""} onChange={(e) => set("quantity", e.target.value)} />
        <select className={cls} value={form.purchase_order_id ?? ""} onChange={(e) => set("purchase_order_id", e.target.value)}>
          <option value="">Pedido de compra</option>
          {(candidates.data?.rows ?? []).map((po) => (
            <option key={po.id} value={po.id}>
              {po.order_number} — {po.supplier_name} ({formatMoney(po.total_amount)})
            </option>
          ))}
        </select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.supplier_id || !form.document_number}>
          Salvar
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

/* ============================================================
 * Central de exceções
 * ============================================================ */
export function ExcecoesPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryExceptions);
  const [open, setOpen] = useState<Record<string, string>>({});
  const canRead = hasPermission("purchase_exceptions.read");
  const canResolve = hasPermission("purchase_exceptions.resolve");
  const q = useQuery({
    queryKey: ["purchasing", "exceptions", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "exceptions", filters: {}, page: 1 } })) as ExceptionList,
    enabled: Boolean(org && canRead),
  });
  const act = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: "resolve" | "ignore" | "reopen"; notes?: string }) =>
      await exceptionAction({
        data: { organizationId: org!, exceptionId: id as never, action, data: { resolution_notes: notes } as never },
      }),
    onSuccess: () => {
      toast.success("Exceção atualizada.");
      void qc.invalidateQueries({ queryKey: ["purchasing", "exceptions", org] });
      void qc.invalidateQueries({ queryKey: ["purchasing", "documents", org] });
      void qc.invalidateQueries({ queryKey: ["purchasing", "dashboard", org] });
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = q.data?.rows ?? [];
  const openRows = rows.filter((r) => ["OPEN", "IN_REVIEW"].includes(r.status));
  return (
    <AppShell title="Compras · Exceções">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !canRead ? (
        <PermissionDenied permission="purchase_exceptions.read" />
      ) : (
        <>
          <h2 className="font-heading text-xl font-semibold">Central de exceções</h2>
          <p className="text-sm text-muted-foreground">
            {openRows.length} exceção(ões) em aberto. Exceções BLOCKING impedem o processamento do documento
            enquanto pendentes.
          </p>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhuma exceção" description="Exceções surgem de excesso de recebimento ou divergência de fatura." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Tipo</th>
                        <th className="pb-2 pr-4">Gravidade</th>
                        <th className="pb-2 pr-4">Mensagem</th>
                        <th className="pb-2 pr-4">Criada em</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((ex) => (
                        <tr key={ex.id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-4 font-mono text-xs">{ex.exception_type}</td>
                          <td className="py-2 pr-4">
                            <PStatus status={ex.severity} />
                          </td>
                          <td className="py-2 pr-4">{ex.message}</td>
                          <td className="py-2 pr-4">{formatDate(ex.created_at)}</td>
                          <td className="py-2 pr-4">
                            <PStatus status={ex.status} />
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              {["OPEN", "IN_REVIEW"].includes(ex.status) && canResolve ? (
                                <>
                                  <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen((p) => ({ ...p, [ex.id]: "resolve" }))}>
                                    Resolver
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7" onClick={() => act.mutate({ id: ex.id, action: "ignore" })}>
                                    Ignorar
                                  </Button>
                                </>
                              ) : null}
                              {["RESOLVED", "IGNORED_WITH_AUTHORIZATION"].includes(ex.status) && canResolve ? (
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => act.mutate({ id: ex.id, action: "reopen" })}>
                                  Reabrir
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {Object.entries(open).map(([id, action]) => (
            <ResolveDialog
              key={id}
              exceptionId={id}
              isIgnore={action === "ignore"}
              onClose={() => setOpen((p) => ({ ...p, [id]: "" }))}
              onResolve={(notes) => {
                setOpen((p) => ({ ...p, [id]: "" }));
                void act.mutate({ id, action: action as "resolve", notes });
              }}
            />
          ))}
        </>
      )}
    </AppShell>
  );
}

function ResolveDialog({
  exceptionId,
  isIgnore,
  onClose,
  onResolve,
}: {
  exceptionId: string;
  isIgnore: boolean;
  onClose: () => void;
  onResolve: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  void isIgnore;
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Resolver exceção">
      <Input
        placeholder="Notas de resolução *"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!notes.trim()} onClick={() => onResolve(notes.trim())}>
          Confirmar
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

/* ============================================================
 * Reposição
 * ============================================================ */
export function ReposicaoPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const fetch = useServerFn(queryReplenishment);
  const [months, setMonths] = useState("3");
  const filters = { months };
  const q = useQuery({
    queryKey: ["purchasing", "replenishment", org, months],
    queryFn: async () =>
      (await fetch({
        data: { organizationId: org!, filters, page: 1 },
      })) as ReplenishmentResult,
    enabled: Boolean(org && hasPermission("purchasing.read")),
  });
  const rows = q.data?.rows ?? [];
  const candidates = rows.filter((r) => r.recommend_order);
  const totalCost = candidates.reduce((acc, r) => acc + r.estimated_cost, 0);
  return (
    <AppShell title="Compras · Reposição">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission("purchasing.read") ? (
        <PermissionDenied permission="purchasing.read" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Sugestões de reposição</h2>
            <select aria-label="Meses de consumo" className={cls} value={months} onChange={(e) => setMonths(e.target.value)}>
              <option value="1">1 mês</option>
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Variantes monitoradas</p>
              <p className="text-xl font-semibold">{rows.length}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Com recomendação de compra</p>
              <p className="text-xl font-semibold">{candidates.length}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm text-muted-foreground">Custo estimado de reposição</p>
              <p className="text-xl font-semibold">{formatMoney(totalCost)}</p>
            </div>
          </div>
          {q.error ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nada para repor" description="Configure minimum_stock / reorder_point em variantes ativas com política diferente de MANUAL." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Produto</th>
                        <th className="pb-2 pr-4">Política</th>
                        <th className="pb-2 pr-4 text-right">Disponível</th>
                        <th className="pb-2 pr-4 text-right">Em pedido</th>
                        <th className="pb-2 pr-4 text-right">Ritmo/mês</th>
                        <th className="pb-2 pr-4 text-right">Sugerido</th>
                        <th className="pb-2 pr-4 text-right">Buffer lead</th>
                        <th className="pb-2 pr-4 text-right">Custo est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.variant_id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-4">
                            {r.product_name} <span className="text-muted-foreground">({r.sku})</span>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">{r.replenishment_policy}</td>
                          <td className="py-2 pr-4 text-right">{formatNumber(r.available)}</td>
                          <td className="py-2 pr-4 text-right">{formatNumber(r.open_qty)}</td>
                          <td className="py-2 pr-4 text-right">{formatNumber(r.monthly_pace)}</td>
                          <td className={`py-2 pr-4 text-right font-semibold ${r.recommend_order ? "text-emerald-600" : ""}`}>
                            {formatNumber(r.suggested_quantity)}
                          </td>
                          <td className="py-2 pr-4 text-right">{formatNumber(r.lead_buffer)}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(r.estimated_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}

/* ============================================================
 * Configurações
 * ============================================================ */
export function PurchasingSettingsPage() {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const org = currentOrganization?.organization_id;
  const qc = useQueryClient();
  const fetch = useServerFn(queryPurchasing);
  const [form, setForm] = useState<Record<string, string>>({});
  const can = hasPermission("suppliers.manage");
  const q = useQuery({
    queryKey: ["purchasing", "settings", org],
    queryFn: async () =>
      (await fetch({ data: { organizationId: org!, kind: "settings" } })) as { settings: PurchasingSettings },
    enabled: Boolean(org),
  });
  useEffect(() => {
    const s = q.data?.settings;
    if (s) {
      setForm({
        acquisition_cost_policy: s.acquisition_cost_policy,
        freight_policy: s.freight_policy,
        over_receipt_policy: s.over_receipt_policy,
        payable_on: s.payable_on,
        approval_segregation: String(s.approval_segregation),
      });
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () =>
      await savePurchasingSettings({
        data: {
          organizationId: org!,
          data: {
            acquisition_cost_policy: form.acquisition_cost_policy as "LAST_PURCHASE" | "AVERAGE",
            freight_policy: form.freight_policy as "EXPENSE_SEPARATELY" | "INCLUDE_IN_INVENTORY_COST",
            over_receipt_policy: form.over_receipt_policy as "BLOCK" | "WARN" | "AUTH_OVERRIDE",
            payable_on: form.payable_on as "GOODS_RECEIPT" | "INVOICE",
            approval_segregation: form.approval_segregation === "true",
          },
        },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas.");
      void qc.invalidateQueries({ queryKey: ["purchasing", "settings", org] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <AppShell title="Compras · Configurações">
      <PurchasingNavigation />
      {isLoading ? (
        <LoadingState />
      ) : !org ? (
        <EmptyState title="Selecione uma organização" />
      ) : !can ? (
        <PermissionDenied permission="suppliers.manage" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : (
        <div className="max-w-lg space-y-3">
          <h2 className="font-heading text-xl font-semibold">Configurações de compras</h2>
          <label className="block text-sm">
            Política de custo de aquisição
            <select className={cls} value={form.acquisition_cost_policy ?? ""} onChange={(e) => set("acquisition_cost_policy", e.target.value)}>
              <option value="LAST_PURCHASE">Última compra</option>
              <option value="AVERAGE">Média ponderada</option>
            </select>
          </label>
          <label className="block text-sm">
            Tratamento do frete
            <select className={cls} value={form.freight_policy ?? ""} onChange={(e) => set("freight_policy", e.target.value)}>
              <option value="EXPENSE_SEPARATELY">Despesa separada</option>
              <option value="INCLUDE_IN_INVENTORY_COST">Incluir no custo do estoque</option>
            </select>
          </label>
          <label className="block text-sm">
            Excesso de recebimento
            <select className={cls} value={form.over_receipt_policy ?? ""} onChange={(e) => set("over_receipt_policy", e.target.value)}>
              <option value="BLOCK">Bloquear (sem resolver exceções)</option>
              <option value="WARN">Avisar</option>
              <option value="AUTH_OVERRIDE">Permitir com autorização (gera exceção)</option>
            </select>
          </label>
          <label className="block text-sm">
            Criação de obrigações financeiras
            <select className={cls} value={form.payable_on ?? ""} onChange={(e) => set("payable_on", e.target.value)}>
              <option value="GOODS_RECEIPT">No recebimento</option>
              <option value="INVOICE">Na fatura processada</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.approval_segregation === "true"}
              onChange={(e) => set("approval_segregation", String(e.target.checked))}
            />
            Exigir segregação de funções na aprovação de pedidos
          </label>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Salvar
          </Button>
        </div>
      )}
    </AppShell>
  );
}

function formatNumber(value: number | string | null | undefined, digits = 3): string {
  if (value == null) return "0";
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n);
}