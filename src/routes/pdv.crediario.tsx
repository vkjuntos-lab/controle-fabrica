import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { usePdvAuth } from "@/lib/pdv-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Wallet, Plus, Search, AlertTriangle, TrendingUp, Clock,
  CheckCircle2, Ban, Unlock, RefreshCw, Receipt, DollarSign,
  QrCode, MessageCircle, Copy, ExternalLink, Sparkles, Settings,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { generateInstallmentPix } from "@/lib/pdv-crediario.functions";

export const Route = createFileRoute("/pdv/crediario")({
  component: CrediarioPage,
});

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

type Installment = {
  id: string;
  credit_sale_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  numero: number;
  num_total: number;
  vencimento: string;
  valor: number;
  status: "open" | "paid" | "overdue" | "canceled";
  paid_at: string | null;
  paid_amount: number | null;
  days_late: number;
};

type Dashboard = {
  to_receive_today: number;
  overdue_amount: number;
  received_today: number;
  default_rate: number;
  open_count: number;
  overdue_count: number;
};

type Wallet = {
  limit_amount: number;
  used: number;
  available: number;
  score: number;
  tier: "A" | "B" | "C";
  blocked: boolean;
  blocked_reason: string | null;
  overdue_count: number;
  open_count: number;
  next_due: string | null;
};

type Customer = { id: string; name: string; cpf: string; phone: string | null };

function tierColor(tier: string) {
  if (tier === "A") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (tier === "B") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
}

function CrediarioPage() {
  const { user } = usePdvAuth();
  const { currentStoreId, loading } = useCurrentStore();
  const qc = useQueryClient();
  const [scope, setScope] = React.useState<"upcoming" | "overdue" | "open" | "paid" | "all" | "events">("upcoming");
  const [search, setSearch] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<{ id: string; name: string } | null>(null);
  const [payFor, setPayFor] = React.useState<Installment | null>(null);
  const [pixFor, setPixFor] = React.useState<Installment | null>(null);
  const [newSaleOpen, setNewSaleOpen] = React.useState(false);
  const [policiesOpen, setPoliciesOpen] = React.useState(false);

  const canManage = user?.role === "admin" || user?.role === "manager";
  const storeId = currentStoreId;

  const dash = useQuery({
    queryKey: ["credit-dashboard", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("credit_dashboard", { _store_id: storeId as string });
      if (error) throw error;
      const row = (data ?? [])[0] as Dashboard | undefined;
      return row ?? {
        to_receive_today: 0, overdue_amount: 0, received_today: 0,
        default_rate: 0, open_count: 0, overdue_count: 0,
      };
    },
    enabled: !!storeId,
  });

  const list = useQuery({
    queryKey: ["credit-installments", storeId, scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_credit_installments", {
        _store_id: storeId as string,
        _scope: scope,
      });
      if (error) throw error;
      return (data ?? []) as Installment[];
    },
    enabled: !!storeId,
  });

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list.data ?? [];
    return (list.data ?? []).filter((r) =>
      r.customer_name.toLowerCase().includes(s) ||
      (r.customer_phone ?? "").toLowerCase().includes(s),
    );
  }, [list.data, search]);

  async function markOverdue() {
    const { data, error } = await supabase.rpc("mark_overdue_installments");
    if (error) return toast.error(error.message);
    toast.success(`${data ?? 0} parcelas marcadas como vencidas`);
    qc.invalidateQueries({ queryKey: ["credit-dashboard"] });
    qc.invalidateQueries({ queryKey: ["credit-installments"] });
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!storeId) return (
    <div className="p-6">
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        Selecione uma loja para acessar o crediário.
      </CardContent></Card>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Wallet className="h-6 w-6 text-primary" /> Crediário Inteligente
          </h1>
          <p className="text-sm text-muted-foreground">
            Venda fiado com controle de limite, parcelamento e cobrança.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={markOverdue}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar vencidas
          </Button>
          {canManage && (
            <Button variant="outline" onClick={() => setPoliciesOpen(true)}>
              <Settings className="mr-2 h-4 w-4" /> Regras de crédito
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setNewSaleOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova venda fiado
            </Button>
          )}
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="A receber hoje" value={brl(dash.data?.to_receive_today ?? 0)} icon={<Clock className="h-4 w-4" />} />
        <Kpi label="Em atraso" value={brl(dash.data?.overdue_amount ?? 0)}
             icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
             sub={`${dash.data?.overdue_count ?? 0} parcelas`} />
        <Kpi label="Recebidos hoje" value={brl(dash.data?.received_today ?? 0)}
             icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} />
        <Kpi label="Inadimplência" value={`${(dash.data?.default_rate ?? 0).toFixed(1)}%`}
             icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <TabsList>
              <TabsTrigger value="upcoming">Próximas 7d</TabsTrigger>
              <TabsTrigger value="overdue">Vencidas</TabsTrigger>
              <TabsTrigger value="open">Em aberto</TabsTrigger>
              <TabsTrigger value="paid">Pagas</TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="events">Cobranças</TabsTrigger>
            </TabsList>
          </Tabs>
          {scope !== "events" && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Cliente ou telefone…"
                     value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {scope === "events" ? (
            <CollectionEventsTable storeId={storeId} />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Parcela</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>
                )}
                {!list.isLoading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma parcela.</td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <button className="text-left font-medium hover:underline"
                              onClick={() => setSelectedCustomer({ id: r.customer_id, name: r.customer_name })}>
                        {r.customer_name}
                      </button>
                      {r.customer_phone && <div className="text-xs text-muted-foreground">{r.customer_phone}</div>}
                    </td>
                    <td className="px-3 py-2">{r.numero}/{r.num_total}</td>
                    <td className="px-3 py-2">
                      {fmtDate(r.vencimento)}
                      {r.days_late > 0 && (
                        <div className="text-xs text-rose-500">{r.days_late}d de atraso</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{brl(r.valor)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} daysLate={r.days_late} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status !== "paid" && r.status !== "canceled" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setPixFor(r)}>
                            <QrCode className="mr-1 h-3 w-3" /> PIX
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPayFor(r)}>
                            <Receipt className="mr-1 h-3 w-3" /> Pagar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>


      {selectedCustomer && (
        <WalletDrawer
          customer={selectedCustomer}
          storeId={storeId}
          canManage={canManage}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {payFor && (
        <PayInstallmentDialog
          installment={payFor}
          onClose={() => setPayFor(null)}
          onPaid={() => {
            setPayFor(null);
            qc.invalidateQueries({ queryKey: ["credit-dashboard"] });
            qc.invalidateQueries({ queryKey: ["credit-installments"] });
            qc.invalidateQueries({ queryKey: ["credit-wallet"] });
          }}
        />
      )}

      {pixFor && (
        <GeneratePixDialog
          installment={pixFor}
          onClose={() => setPixFor(null)}
        />
      )}



      {newSaleOpen && (
        <NewCreditSaleDialog
          storeId={storeId}
          onClose={() => setNewSaleOpen(false)}
          onCreated={() => {
            setNewSaleOpen(false);
            qc.invalidateQueries({ queryKey: ["credit-dashboard"] });
            qc.invalidateQueries({ queryKey: ["credit-installments"] });
          }}
        />
      )}

      {policiesOpen && (
        <CreditPoliciesDialog storeId={storeId} onClose={() => setPoliciesOpen(false)} />
      )}
    </div>
  );
}

function Kpi({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          {icon}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, daysLate }: { status: string; daysLate: number }) {
  if (status === "paid") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30" variant="outline">Paga</Badge>;
  if (status === "canceled") return <Badge variant="outline">Cancelada</Badge>;
  if (status === "overdue" || daysLate > 0) return <Badge variant="destructive">Vencida</Badge>;
  return <Badge variant="secondary">Em aberto</Badge>;
}

/* ============ Wallet Drawer ============ */

function WalletDrawer({
  customer, storeId, canManage, onClose,
}: { customer: { id: string; name: string }; storeId: string; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [limitOpen, setLimitOpen] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);

  const wq = useQuery({
    queryKey: ["credit-wallet", customer.id, storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("credit_wallet", {
        _customer_id: customer.id, _store_id: storeId,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as Wallet | null;
    },
  });

  const hq = useQuery({
    queryKey: ["credit-history", customer.id, storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_installments")
        .select("id,numero,vencimento,valor,status,paid_at,paid_amount,credit_sale_id")
        .eq("customer_id", customer.id)
        .eq("store_id", storeId)
        .order("vencimento", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rq = useQuery({
    queryKey: ["credit-risk", customer.id, storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("credit_risk_preview", {
        _customer: customer.id, _store: storeId,
      });
      if (error) throw error;
      return (data ?? [])[0] as any;
    },
  });

  const w = wq.data;

  async function recompute() {
    const { error } = await supabase.rpc("recompute_credit_score", {
      _customer: customer.id, _store: storeId,
    });
    if (error) return toast.error(error.message);
    toast.success("Score recalculado");
    qc.invalidateQueries({ queryKey: ["credit-wallet"] });
    qc.invalidateQueries({ queryKey: ["credit-risk"] });
  }



  async function toggleBlock() {
    if (!w) return;
    const reason = w.blocked ? null : window.prompt("Motivo do bloqueio:") ?? "";
    if (!w.blocked && !reason) return;
    const { error } = await supabase.rpc("toggle_credit_block", {
      _customer: customer.id, _store: storeId, _blocked: !w.blocked, _reason: reason ?? undefined,
    });
    if (error) return toast.error(error.message);
    toast.success(!w.blocked ? "Cliente bloqueado" : "Cliente desbloqueado");
    qc.invalidateQueries({ queryKey: ["credit-wallet"] });
  }

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{customer.name}</SheetTitle>
          <SheetDescription>Carteira e histórico de crediário.</SheetDescription>
        </SheetHeader>

        {!w ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="mt-4 space-y-4">
            {w.blocked && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-rose-700 dark:text-rose-300">
                  <Ban className="h-4 w-4" /> Bloqueado
                </div>
                {w.blocked_reason && <div className="mt-1 text-xs text-muted-foreground">{w.blocked_reason}</div>}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Mini label="Limite" value={brl(w.limit_amount)} />
              <Mini label="Usado" value={brl(w.used)} />
              <Mini label="Disponível" value={brl(w.available)} accent />
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <div className="flex-1">
                <div className="text-xs uppercase text-muted-foreground">Score</div>
                <div className="text-2xl font-semibold">{w.score}</div>
              </div>
              <Badge variant="outline" className={tierColor(w.tier)}>Tier {w.tier}</Badge>
              <div className="text-right text-xs text-muted-foreground">
                {w.open_count} em aberto<br />
                {w.overdue_count} vencidas
              </div>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setLimitOpen(true)}>
                  <DollarSign className="mr-1 h-3 w-3" /> Ajustar limite
                </Button>
                <Button size="sm" variant="outline" onClick={recompute}>
                  <Sparkles className="mr-1 h-3 w-3" /> Recalcular score
                </Button>
                <Button size="sm" variant={w.blocked ? "default" : "outline"} onClick={toggleBlock}>
                  {w.blocked ? <Unlock className="mr-1 h-3 w-3" /> : <Ban className="mr-1 h-3 w-3" />}
                  {w.blocked ? "Desbloquear" : "Bloquear"}
                </Button>
              </div>
            )}

            {rq.data && <RiskPanel data={rq.data} />}

            <div>
              <div className="mb-2 text-sm font-medium">Histórico ({hq.data?.length ?? 0})</div>
              <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                {(hq.data ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div>
                      <div>Parc. {r.numero} · venc {fmtDate(r.vencimento as string)}</div>
                      {r.paid_at && (
                        <div className="text-xs text-emerald-600">
                          Pago em {new Date(r.paid_at as string).toLocaleDateString("pt-BR")}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{brl(Number(r.valor))}</div>
                      <StatusBadge status={r.status as string} daysLate={0} />
                    </div>
                  </div>
                ))}
                {(hq.data ?? []).length === 0 && (
                  <div className="text-center text-xs text-muted-foreground">Sem histórico.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {limitOpen && w && (
          <AdjustLimitDialog
            customer={customer} storeId={storeId} currentLimit={w.limit_amount}
            onClose={() => setLimitOpen(false)}
            onSaved={() => {
              setLimitOpen(false);
              qc.invalidateQueries({ queryKey: ["credit-wallet"] });
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${accent ? "bg-primary/5" : ""}`}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function AdjustLimitDialog({
  customer, storeId, currentLimit, onClose, onSaved,
}: {
  customer: { id: string; name: string }; storeId: string; currentLimit: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [val, setVal] = React.useState(String(currentLimit));
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const n = Number(val.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return toast.error("Valor inválido");
    setSaving(true);
    const { error } = await supabase.rpc("adjust_credit_limit", {
      _customer: customer.id, _store: storeId, _new_limit: n, _reason: reason || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Limite atualizado");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar limite — {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Novo limite (R$)</Label>
            <Input value={val} onChange={(e) => setVal(e.target.value)} />
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Pay installment ============ */

function PayInstallmentDialog({
  installment, onClose, onPaid,
}: { installment: Installment; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = React.useState(String(installment.valor));
  const [method, setMethod] = React.useState("cash");
  const [bankId, setBankId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const banks = useQuery({
    queryKey: ["bank-accounts-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("id,name").eq("active", true);
      return data ?? [];
    },
  });

  async function pay() {
    const n = Number(amount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return toast.error("Valor inválido");
    setSaving(true);
    const { error } = await supabase.rpc("pay_installment", {
      _installment_id: installment.id,
      _amount: n,
      _method: method,
      _bank_account: bankId || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pagamento registrado");
    onPaid();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            {installment.customer_name} · Parc. {installment.numero}/{installment.num_total} · Venc. {fmtDate(installment.vencimento)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Valor recebido (R$)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Método</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="debit">Cartão débito</SelectItem>
                <SelectItem value="credit">Cartão crédito</SelectItem>
                <SelectItem value="transfer">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Conta bancária (opcional)</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {(banks.data ?? []).map((b: { id: string; name: string }) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={pay} disabled={saving}>Confirmar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ New Credit Sale ============ */

function NewCreditSaleDialog({
  storeId, onClose, onCreated,
}: { storeId: string; onClose: () => void; onCreated: () => void }) {
  const [search, setSearch] = React.useState("");
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [total, setTotal] = React.useState("");
  const [entrada, setEntrada] = React.useState("0");
  const [parcelas, setParcelas] = React.useState("3");
  const [primeiro, setPrimeiro] = React.useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [intervalo, setIntervalo] = React.useState("30");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const cq = useQuery({
    queryKey: ["credit-customer-search", search],
    queryFn: async () => {
      const s = search.trim();
      if (s.length < 2) return [];
      const { data } = await supabase
        .from("customers")
        .select("id,name,cpf,phone")
        .or(`name.ilike.%${s}%,cpf.ilike.%${s}%,phone.ilike.%${s}%`)
        .limit(8);
      return (data ?? []) as Customer[];
    },
    enabled: search.trim().length >= 2 && !customer,
  });

  const wq = useQuery({
    queryKey: ["credit-wallet", customer?.id, storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("credit_wallet", {
        _customer_id: customer!.id, _store_id: storeId,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as Wallet | null;
    },
    enabled: !!customer,
  });

  const w = wq.data;
  const totalN = Number(total.replace(",", ".")) || 0;
  const entradaN = Number(entrada.replace(",", ".")) || 0;
  const restante = Math.max(0, totalN - entradaN);
  const parcelasN = Math.max(1, Number(parcelas) || 1);
  const valorParc = restante > 0 ? Math.round((restante / parcelasN) * 100) / 100 : 0;

  const preview = React.useMemo(() => {
    const arr: { n: number; venc: string; val: number }[] = [];
    const base = new Date(primeiro + "T00:00:00");
    const interv = Number(intervalo) || 30;
    let acc = 0;
    for (let i = 1; i <= parcelasN; i++) {
      const d = new Date(base); d.setDate(d.getDate() + (i - 1) * interv);
      const v = i === parcelasN ? Math.round((restante - acc) * 100) / 100 : valorParc;
      acc += valorParc;
      arr.push({ n: i, venc: d.toISOString().slice(0, 10), val: v });
    }
    return arr;
  }, [primeiro, intervalo, parcelasN, valorParc, restante]);

  const canSubmit = customer && totalN > 0 && restante > 0 && (!w || (!w.blocked && w.tier !== "C" && restante <= w.available));

  async function submit() {
    if (!customer) return;
    setSaving(true);
    const { error } = await supabase.rpc("create_credit_sale", {
      _customer: customer.id,
      _store: storeId,
      _total: totalN,
      _entrada: entradaN,
      _parcelas: parcelasN,
      _primeiro_venc: primeiro,
      _intervalo_dias: Number(intervalo) || 30,
      _notes: notes || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Venda fiado criada");
    onCreated();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova venda fiado</DialogTitle>
          <DialogDescription>Selecione o cliente e configure as parcelas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!customer ? (
            <div>
              <Label>Cliente</Label>
              <Input placeholder="Nome, CPF ou telefone…"
                     value={search} onChange={(e) => setSearch(e.target.value)} />
              {cq.data && cq.data.length > 0 && (
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-md border p-1">
                  {cq.data.map((c) => (
                    <button key={c.id}
                            className="flex w-full items-center justify-between rounded p-2 text-left text-sm hover:bg-muted"
                            onClick={() => setCustomer(c)}>
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.cpf || c.phone || "—"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-xs text-muted-foreground">{customer.cpf || customer.phone}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>Trocar</Button>
              </div>
              {w && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Limite:</span> {brl(w.limit_amount)}</div>
                  <div><span className="text-muted-foreground">Disponível:</span> <b>{brl(w.available)}</b></div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={tierColor(w.tier)}>Tier {w.tier}</Badge>
                    {w.blocked && <Badge variant="destructive">Bloqueado</Badge>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label>Total (R$)</Label>
              <Input value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
            <div>
              <Label>Entrada (R$)</Label>
              <Input value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            </div>
            <div>
              <Label>Parcelas</Label>
              <Input type="number" min={1} max={24} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
            </div>
            <div>
              <Label>Intervalo (dias)</Label>
              <Input type="number" min={1} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>1º vencimento</Label>
              <Input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
            </div>
            <div className="col-span-2 flex items-end">
              <div className="w-full rounded-md border bg-muted/40 p-2 text-xs">
                <div>Restante: <b>{brl(restante)}</b></div>
                <div>Parcela média: <b>{brl(valorParc)}</b></div>
              </div>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {customer && w && !w.blocked && w.tier !== "C" && restante > w.available && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300">
              Restante ({brl(restante)}) excede o limite disponível ({brl(w.available)}).
            </div>
          )}
          {w?.tier === "C" && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
              Cliente com Tier C não pode comprar fiado.
            </div>
          )}
          {w?.blocked && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
              Cliente bloqueado{w.blocked_reason ? `: ${w.blocked_reason}` : ""}.
            </div>
          )}

          {preview.length > 0 && restante > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Preview das parcelas</div>
              <div className="max-h-40 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.map((p) => (
                      <tr key={p.n} className="border-b last:border-0">
                        <td className="px-2 py-1">Parc. {p.n}/{parcelasN}</td>
                        <td className="px-2 py-1">{fmtDate(p.venc)}</td>
                        <td className="px-2 py-1 text-right font-medium">{brl(p.val)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>Criar venda fiado</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ PIX generation dialog ============ */

function GeneratePixDialog({
  installment, onClose,
}: { installment: Installment; onClose: () => void }) {
  const [state, setState] = React.useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; qr: string; qrB64: string | null; ticket: string | null; wa: string | null; msg: string }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });
  const gen = useServerFn(generateInstallmentPix);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        const res = await gen({ data: { installmentId: installment.id } });
        if (cancelled) return;
        setState({
          kind: "ok", qr: res.qrCode, qrB64: res.qrCodeBase64,
          ticket: res.ticketUrl, wa: res.whatsappUrl, msg: res.message,
        });
      } catch (e) {
        if (cancelled) return;
        setState({ kind: "err", msg: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [installment.id, gen]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>PIX da parcela</DialogTitle>
          <DialogDescription>
            {installment.customer_name} · Parc. {installment.numero}/{installment.num_total} · {brl(installment.valor)}
          </DialogDescription>
        </DialogHeader>
        {state.kind === "loading" && (
          <div className="py-10 text-center text-sm text-muted-foreground">Gerando cobrança…</div>
        )}
        {state.kind === "err" && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            {state.msg}
          </div>
        )}
        {state.kind === "ok" && (
          <div className="space-y-3">
            {state.qrB64 && (
              <div className="flex justify-center rounded-md border bg-white p-3">
                <img alt="QR PIX" src={`data:image/png;base64,${state.qrB64}`} className="h-52 w-52" />
              </div>
            )}
            <div>
              <Label>Copia & cola</Label>
              <div className="flex gap-2">
                <Input readOnly value={state.qr} className="text-xs" />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(state.qr); toast.success("Copiado");
                }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {state.wa && (
                <Button asChild variant="default">
                  <a href={state.wa} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1 h-4 w-4" /> Enviar por WhatsApp
                  </a>
                </Button>
              )}
              {state.ticket && (
                <Button asChild variant="outline">
                  <a href={state.ticket} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> Página MP
                  </a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A parcela é baixada automaticamente quando o cliente pagar.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Collection events table ============ */

type CollectionEvent = {
  id: string;
  installment_id: string;
  customer_id: string;
  offset_days: number;
  level: number;
  channel: string;
  message: string;
  wa_url: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
};

function CollectionEventsTable({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["credit-events", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_events")
        .select("id,installment_id,customer_id,offset_days,level,channel,message,wa_url,status,sent_at,created_at,customers(name,phone)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as (CollectionEvent & { customers: { name: string; phone: string | null } | null })[];
    },
  });

  async function markSent(id: string) {
    const { error } = await supabase
      .from("collection_events")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["credit-events"] });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Cliente</th>
            <th className="px-3 py-2 text-left">Nível</th>
            <th className="px-3 py-2 text-left">Offset</th>
            <th className="px-3 py-2 text-left">Mensagem</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {q.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
          {!q.isLoading && (q.data ?? []).length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma cobrança automática ainda.</td></tr>
          )}
          {(q.data ?? []).map((e) => (
            <tr key={e.id} className="border-t hover:bg-muted/40">
              <td className="px-3 py-2 text-xs">
                {new Date(e.created_at).toLocaleDateString("pt-BR")}<br />
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </td>
              <td className="px-3 py-2">{e.customers?.name ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge variant={e.level >= 3 ? "destructive" : "secondary"}>Nível {e.level}</Badge>
              </td>
              <td className="px-3 py-2 text-xs">
                {e.offset_days < 0 ? `D${e.offset_days}` : e.offset_days === 0 ? "D0" : `D+${e.offset_days}`}
              </td>
              <td className="max-w-md px-3 py-2 text-xs text-muted-foreground">{e.message}</td>
              <td className="px-3 py-2">
                <Badge variant={e.status === "sent" ? "outline" : "secondary"}>{e.status}</Badge>
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  {e.wa_url && (
                    <Button asChild size="sm" variant="outline">
                      <a href={e.wa_url} target="_blank" rel="noreferrer" onClick={() => markSent(e.id)}>
                        <MessageCircle className="mr-1 h-3 w-3" /> Enviar
                      </a>
                    </Button>
                  )}
                  {e.status !== "sent" && (
                    <Button size="sm" variant="ghost" onClick={() => markSent(e.id)}>
                      Marcar enviado
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============ Risk preview + Policies (Onda C) ============ */

function RiskPanel({ data }: { data: any }) {
  const p = Number(data?.probability ?? 0);
  const color =
    p >= 60 ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
    : p >= 30 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4" /> Risco de inadimplência
        </div>
        <Badge variant="outline" className={color}>{p.toFixed(0)}%</Badge>
      </div>
      <div className="mb-2 h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className={p >= 60 ? "bg-rose-500 h-full" : p >= 30 ? "bg-amber-500 h-full" : "bg-emerald-500 h-full"}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Pagas em dia: <span className="text-foreground">{data.paid_ontime ?? 0}</span></div>
        <div>Pagas atrasadas: <span className="text-foreground">{data.paid_late ?? 0}</span></div>
        <div>Vencidas hoje: <span className="text-foreground">{data.overdue_now ?? 0}</span></div>
        <div>Média atraso: <span className="text-foreground">{Number(data.avg_days_late ?? 0)}d</span></div>
      </div>
    </div>
  );
}

type Policy = {
  store_id: string;
  tier_a_limit: number;
  tier_b_limit: number;
  tier_c_limit: number;
  base_score: number;
  auto_apply_limit: boolean;
};

function CreditPoliciesDialog({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = React.useState(false);
  const [pol, setPol] = React.useState<Policy | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.from("credit_policies").select("*").eq("store_id", storeId).maybeSingle();
      setPol(
        (data as Policy) ?? {
          store_id: storeId, tier_a_limit: 1000, tier_b_limit: 500, tier_c_limit: 0,
          base_score: 80, auto_apply_limit: true,
        },
      );
    })();
  }, [storeId]);

  async function save() {
    if (!pol) return;
    setSaving(true);
    const { error } = await supabase.from("credit_policies").upsert({
      store_id: storeId,
      tier_a_limit: pol.tier_a_limit,
      tier_b_limit: pol.tier_b_limit,
      tier_c_limit: pol.tier_c_limit,
      base_score: pol.base_score,
      auto_apply_limit: pol.auto_apply_limit,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Regras salvas");
    qc.invalidateQueries({ queryKey: ["credit-wallet"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regras de crédito</DialogTitle>
          <DialogDescription>
            Limites automáticos por tier e score base. Quando ativo, o "Recalcular score" aplica o limite do tier.
          </DialogDescription>
        </DialogHeader>
        {!pol ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Tier A (R$)</Label>
                <Input type="number" value={pol.tier_a_limit}
                  onChange={(e) => setPol({ ...pol, tier_a_limit: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Tier B (R$)</Label>
                <Input type="number" value={pol.tier_b_limit}
                  onChange={(e) => setPol({ ...pol, tier_b_limit: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Tier C (R$)</Label>
                <Input type="number" value={pol.tier_c_limit}
                  onChange={(e) => setPol({ ...pol, tier_c_limit: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Score base (novo cliente)</Label>
              <Input type="number" value={pol.base_score}
                onChange={(e) => setPol({ ...pol, base_score: Number(e.target.value) })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pol.auto_apply_limit}
                onChange={(e) => setPol({ ...pol, auto_apply_limit: e.target.checked })} />
              Aplicar limite automático ao recalcular score
            </label>
            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              Deltas: +5 em dia · -3 atraso curto · -10 6–30d · -20 30+d (auto)
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !pol}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
