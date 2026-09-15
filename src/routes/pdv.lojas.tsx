import { createFileRoute, Navigate } from "@tanstack/react-router";
import * as React from "react";
import { usePdvAuth } from "@/lib/pdv-auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  createStore,
  updateStore,
  setStoreActive,
} from "@/lib/pdv-stores.functions";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { brl } from "@/lib/pdv-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Users,
  Package,
  DollarSign,
  ShoppingBag,
  AlertTriangle,
  Wallet,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/pdv/lojas")({
  component: LojasRoute,
});

function LojasRoute() {
  const { user, loading } = usePdvAuth();
  if (loading) return null;
  if (!user || user.role !== "admin") return <Navigate to="/pdv/venda" replace />;
  return <Lojas />;
}

type StoreRow = {
  id: string;
  name: string;
  code: string;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  active: boolean;
  operators_count: number;
  products_count: number;
  month_revenue: number;
  month_sales: number;
};

type ConsolidatedRow = {
  store_id: string;
  store_name: string;
  revenue: number;
  sales_count: number;
  avg_ticket: number;
  open_sessions: number;
  pending_pix: number;
  expiring_lots: number;
};

function Lojas() {
  const [tab, setTab] = React.useState<"lista" | "consolidado">("lista");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Building2 className="h-6 w-6" /> Lojas
        </h2>
        <p className="text-xs text-muted-foreground">
          Cadastro de lojas, contadores por loja e visão consolidada do grupo.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="lista">Cadastro</TabsTrigger>
          <TabsTrigger value="consolidado">Consolidado</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="mt-4">
          <StoreList />
        </TabsContent>
        <TabsContent value="consolidado" className="mt-4">
          <Consolidated />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
 * Aba Lista / Cadastro
 * ============================================================ */
function StoreList() {
  const [rows, setRows] = React.useState<StoreRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<StoreRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { refresh: refreshStores } = useCurrentStore();

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_stores_with_stats");
    if (error) {
      toast.error("Erro ao carregar lojas: " + error.message);
      setLoading(false);
      return;
    }
    setRows(((data ?? []) as any[]).map((r) => ({
      ...r,
      month_revenue: Number(r.month_revenue),
      month_sales: Number(r.month_sales),
      operators_count: Number(r.operators_count),
      products_count: Number(r.products_count),
    })));
    setLoading(false);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const toggleActive = useServerFn(setStoreActive);

  async function handleToggle(row: StoreRow) {
    try {
      await toggleActive({ data: { id: row.id, active: !row.active } });
      toast.success(row.active ? "Loja desativada" : "Loja ativada");
      await load();
      await refreshStores();
    } catch (e: any) {
      toast.error(e.message ?? "Falha");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova loja
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma loja cadastrada.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl border p-4 transition-colors ${
                s.active
                  ? "border-border bg-card"
                  : "border-dashed border-border bg-muted/30 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-semibold">{s.name}</h3>
                    {!s.active && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        inativa
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {s.code}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(s)}
                    title="Editar"
                    className="h-7 w-7"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleToggle(s)}
                    title={s.active ? "Desativar" : "Ativar"}
                    className="h-7 w-7"
                  >
                    {s.active ? (
                      <PowerOff className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Power className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                  </Button>
                </div>
              </div>

              {(s.cnpj || s.address || s.phone) && (
                <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  {s.cnpj && <div>CNPJ {s.cnpj}</div>}
                  {s.address && <div className="truncate">{s.address}</div>}
                  {s.phone && <div>{s.phone}</div>}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
                <Stat icon={Users} label="Operadores" value={s.operators_count} />
                <Stat icon={Package} label="Produtos" value={s.products_count} />
                <Stat icon={DollarSign} label="Faturamento mês" value={brl(s.month_revenue)} />
                <Stat icon={ShoppingBag} label="Vendas mês" value={s.month_sales} />
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <StoreDialog
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load();
            await refreshStores();
          }}
        />
      )}
      {editing && (
        <StoreDialog
          store={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            await refreshStores();
          }}
        />
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate font-semibold text-foreground">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Diálogo criar/editar
 * ============================================================ */
function StoreDialog({
  store,
  onClose,
  onSaved,
}: {
  store?: StoreRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(store);
  const [name, setName] = React.useState(store?.name ?? "");
  const [code, setCode] = React.useState(store?.code ?? "");
  const [cnpj, setCnpj] = React.useState(store?.cnpj ?? "");
  const [address, setAddress] = React.useState(store?.address ?? "");
  const [phone, setPhone] = React.useState(store?.phone ?? "");
  const [saving, setSaving] = React.useState(false);

  const create = useServerFn(createStore);
  const update = useServerFn(updateStore);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Nome muito curto");
    if (!isEdit && !/^[A-Za-z0-9_-]{2,20}$/.test(code)) {
      return toast.error("Código: 2-20 caracteres (letras, números, _ ou -)");
    }
    setSaving(true);
    try {
      if (isEdit && store) {
        await update({
          data: {
            id: store.id,
            name: name.trim(),
            cnpj: cnpj.trim() || null,
            address: address.trim() || null,
            phone: phone.trim() || null,
          },
        });
        toast.success("Loja atualizada");
      } else {
        await create({
          data: {
            name: name.trim(),
            code: code.trim(),
            cnpj: cnpj.trim() || null,
            address: address.trim() || null,
            phone: phone.trim() || null,
          },
        });
        toast.success("Loja criada");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Falha");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar loja" : "Nova loja"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="code">
              Código {isEdit && <span className="text-xs text-muted-foreground">(imutável)</span>}
            </Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isEdit}
              placeholder="LOJA01"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="address">Endereço</Label>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : isEdit ? "Salvar" : "Criar loja"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Aba Consolidado (admin — todas as lojas)
 * ============================================================ */
function Consolidated() {
  const [preset, setPreset] = React.useState<"7d" | "30d" | "90d">("30d");
  const [rows, setRows] = React.useState<ConsolidatedRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const end = new Date();
    const start = new Date(end);
    if (preset === "7d") start.setDate(start.getDate() - 7);
    else if (preset === "30d") start.setDate(start.getDate() - 30);
    else start.setDate(start.getDate() - 90);
    supabase
      .rpc("consolidated_by_store", { _from: start.toISOString(), _to: end.toISOString() })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Erro: " + error.message);
        setRows(((data ?? []) as any[]).map((r) => ({
          ...r,
          revenue: Number(r.revenue),
          sales_count: Number(r.sales_count),
          avg_ticket: Number(r.avg_ticket),
          open_sessions: Number(r.open_sessions),
          pending_pix: Number(r.pending_pix),
          expiring_lots: Number(r.expiring_lots),
        })));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [preset]);

  const totals = React.useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        sales: acc.sales + r.sales_count,
        open: acc.open + r.open_sessions,
        pix: acc.pix + r.pending_pix,
        exp: acc.exp + r.expiring_lots,
      }),
      { revenue: 0, sales: 0, open: 0, pix: 0, exp: 0 },
    );
  }, [rows]);

  const max = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1 text-xs">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                preset === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Faturamento total: <span className="font-semibold text-foreground">{brl(totals.revenue)}</span>
          {" · "}
          {totals.sales} vendas
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Sem dados no período.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Loja</th>
                <th className="px-3 py-2 text-right">Faturamento</th>
                <th className="px-3 py-2 text-right">Vendas</th>
                <th className="px-3 py-2 text-right">Ticket</th>
                <th className="px-3 py-2 text-right"><Clock className="ml-auto h-3.5 w-3.5" /></th>
                <th className="px-3 py-2 text-right"><Wallet className="ml-auto h-3.5 w-3.5" /></th>
                <th className="px-3 py-2 text-right"><AlertTriangle className="ml-auto h-3.5 w-3.5" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.store_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.store_name}</div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(r.revenue / max) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{brl(r.revenue)}</td>
                  <td className="px-3 py-2 text-right">{r.sales_count}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{brl(r.avg_ticket)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={r.open_sessions > 0 ? "text-amber-600" : "text-muted-foreground"}>
                      {r.open_sessions}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={r.pending_pix > 0 ? "text-sky-600" : "text-muted-foreground"}>
                      {r.pending_pix}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={r.expiring_lots > 0 ? "text-rose-600" : "text-muted-foreground"}>
                      {r.expiring_lots}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border bg-muted/20 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Colunas de alerta: <Clock className="inline h-3 w-3" /> sessões abertas ·{" "}
            <Wallet className="inline h-3 w-3" /> PIX pendentes ·{" "}
            <AlertTriangle className="inline h-3 w-3" /> lotes vencendo em 60 dias
          </div>
        </div>
      )}
    </div>
  );
}
