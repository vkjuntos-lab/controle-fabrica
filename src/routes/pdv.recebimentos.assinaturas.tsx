import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { usePdvAuth } from "@/lib/pdv-auth";
import { createMPPreapproval } from "@/lib/pdv-subscriptions.functions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Receipt, Plus, Play, Pause, XCircle, ExternalLink, Copy, Repeat } from "lucide-react";

export const Route = createFileRoute("/pdv/recebimentos/assinaturas")({
  component: SubscriptionsPage,
});

type Sub = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  title: string;
  amount: number;
  frequency_type: "days" | "weeks" | "months";
  frequency: number;
  next_charge_at: string;
  status: "pending" | "active" | "paused" | "cancelled" | "completed";
  charges_count: number;
  max_charges: number | null;
  last_charge_at: string | null;
  mp_init_point: string | null;
  mp_preapproval_id: string | null;
  payer_email: string | null;
  created_at: string;
};

type Customer = { id: string; name: string; phone: string | null; email?: string | null };

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
const fmtDate = (s: string | null) => s ? new Date(s + (s.includes("T") ? "" : "T00:00:00")).toLocaleDateString("pt-BR") : "—";
const fmtDT = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const freqLabel = (type: string, freq: number) => {
  const unit = type === "days" ? "dia(s)" : type === "weeks" ? "semana(s)" : "mês(es)";
  return `A cada ${freq} ${unit}`;
};

function StatusBadge({ s }: { s: Sub["status"] }) {
  const map: Record<Sub["status"], { c: string; l: string }> = {
    active:    { c: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", l: "Ativa" },
    pending:   { c: "", l: "Pendente" },
    paused:    { c: "", l: "Pausada" },
    cancelled: { c: "", l: "Cancelada" },
    completed: { c: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300", l: "Concluída" },
  };
  const m = map[s];
  return <Badge className={m.c} variant={s === "active" || s === "completed" ? "outline" : "secondary"}>{m.l}</Badge>;
}

function SubscriptionsPage() {
  const { user } = usePdvAuth();
  const { currentStoreId, loading } = useCurrentStore();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = React.useState(false);
  const canManage = user?.role === "admin" || user?.role === "manager";
  const storeId = currentStoreId;

  const list = useQuery({
    queryKey: ["subs", storeId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_subscriptions", { _store: storeId as string });
      if (error) throw error;
      return (data ?? []) as Sub[];
    },
    enabled: !!storeId,
    refetchInterval: 30000,
  });

  async function setStatus(id: string, status: string) {
    const { error } = await (supabase.rpc as any)("set_subscription_status", { _id: id, _status: status });
    if (error) return toast.error(error.message);
    toast.success("Atualizado");
    qc.invalidateQueries({ queryKey: ["subs"] });
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Link copiado");
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!storeId) return (
    <div className="p-6"><Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
      Selecione uma loja.
    </CardContent></Card></div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Receipt className="h-6 w-6 text-primary" /> Central de Recebimentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Assinaturas recorrentes via Mercado Pago (cartão de crédito).
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setOpenNew(true)}><Plus className="mr-2 h-4 w-4" /> Nova assinatura</Button>
        )}
      </header>

      <nav className="flex flex-wrap gap-1 rounded-md bg-muted p-1 text-sm">
        <Link to="/pdv/recebimentos" className="rounded px-3 py-1.5 hover:bg-background/60">Links</Link>
        <Link to="/pdv/recebimentos/boletos" className="rounded px-3 py-1.5 hover:bg-background/60">Boletos</Link>
        <Link to="/pdv/recebimentos/agendamentos" className="rounded px-3 py-1.5 hover:bg-background/60">Agendamentos</Link>
        <Link to="/pdv/recebimentos/assinaturas" className="rounded px-3 py-1.5 bg-background shadow-sm font-medium">Assinaturas</Link>
      </nav>

      <Card>
        <CardHeader className="text-xs text-muted-foreground">
          O cliente precisa autorizar o débito recorrente no link do MP. As cobranças subsequentes
          são feitas automaticamente e o webhook baixa cada pagamento no financeiro.
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Título</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Frequência</th>
                  <th className="px-3 py-2 text-left">Próx. cobrança</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
                {!list.isLoading && (list.data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma assinatura.</td></tr>
                )}
                {(list.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div>{r.customer_name}</div>
                      {r.payer_email && <div className="text-[10px] text-muted-foreground">{r.payer_email}</div>}
                    </td>
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2 text-right font-medium">{brl(Number(r.amount))}</td>
                    <td className="px-3 py-2">{freqLabel(r.frequency_type, r.frequency)}</td>
                    <td className="px-3 py-2">
                      {fmtDate(r.next_charge_at)}
                      <div className="text-[10px] text-muted-foreground">
                        {r.charges_count}{r.max_charges ? `/${r.max_charges}` : ""} cobrança(s)
                        {r.last_charge_at && ` · última ${fmtDT(r.last_charge_at)}`}
                      </div>
                    </td>
                    <td className="px-3 py-2"><StatusBadge s={r.status} /></td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {r.mp_init_point && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => copy(r.mp_init_point!)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => window.open(r.mp_init_point!, "_blank")}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {canManage && r.status === "active" && (
                          <Button size="sm" variant="ghost" title="Pausar" onClick={() => setStatus(r.id, "paused")}>
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && r.status === "paused" && (
                          <Button size="sm" variant="ghost" title="Reativar" onClick={() => setStatus(r.id, "active")}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && r.status !== "cancelled" && r.status !== "completed" && (
                          <Button size="sm" variant="ghost" title="Cancelar" onClick={() => {
                            if (confirm("Cancelar assinatura?")) setStatus(r.id, "cancelled");
                          }}>
                            <XCircle className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {openNew && (
        <NewSubDialog
          storeId={storeId}
          onClose={() => setOpenNew(false)}
          onCreated={() => { setOpenNew(false); qc.invalidateQueries({ queryKey: ["subs"] }); }}
        />
      )}
    </div>
  );
}

function NewSubDialog({ storeId, onClose, onCreated }: {
  storeId: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [freqType, setFreqType] = React.useState<"days" | "weeks" | "months">("months");
  const [freq, setFreq] = React.useState("1");
  const [next, setNext] = React.useState(new Date(Date.now() + 86400_000).toISOString().slice(0, 10));
  const [maxCharges, setMaxCharges] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [payerEmail, setPayerEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const createPre = useServerFn(createMPPreapproval);

  const customers = useQuery({
    queryKey: ["customers-mini-sub", customerSearch],
    queryFn: async () => {
      const q = supabase.from("customers").select("id,name,phone,email").limit(20);
      if (customerSearch.trim()) q.ilike("name", `%${customerSearch.trim()}%`);
      const { data } = await q;
      return (data ?? []) as Customer[];
    },
  });

  async function save() {
    if (!customerId) return toast.error("Selecione um cliente");
    if (!title.trim()) return toast.error("Título obrigatório");
    if (!payerEmail.trim() || !payerEmail.includes("@")) return toast.error("E-mail do pagador obrigatório");
    const amt = Number(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Valor inválido");
    const f = Number(freq);
    if (!Number.isInteger(f) || f < 1) return toast.error("Frequência inválida");

    setSaving(true);
    const { data: newId, error } = await (supabase.rpc as any)("create_subscription", {
      _store: storeId,
      _customer: customerId,
      _title: title.trim(),
      _amount: amt,
      _freq_type: freqType,
      _freq: f,
      _next: next,
      _payer_email: payerEmail.trim(),
      _max_charges: maxCharges ? Number(maxCharges) : null,
      _notes: notes || null,
    });
    if (error) { setSaving(false); return toast.error(error.message); }
    const id = String(newId);

    try {
      const res = await createPre({ data: { subscriptionId: id } });
      setSaving(false);
      toast.success("Assinatura criada · autorize no link do MP");
      if (res?.initPoint) window.open(res.initPoint, "_blank");
    } catch (e: any) {
      setSaving(false);
      toast.error(`Criada, mas MP falhou: ${e?.message ?? e}`);
    }
    onCreated();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" /> Nova assinatura
          </DialogTitle>
          <DialogDescription>Cobrança recorrente no cartão via Mercado Pago.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Cliente</Label>
            <Input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); }} placeholder="Buscar cliente…" />
            {customerSearch && (customers.data ?? []).length > 0 && !customerId && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded border bg-popover">
                {(customers.data ?? []).map((c) => (
                  <button key={c.id} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerSearch(c.name);
                      if (c.email && !payerEmail) setPayerEmail(c.email);
                    }}>
                    {c.name} {c.phone && <span className="text-xs text-muted-foreground">· {c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>E-mail do pagador (Mercado Pago)</Label>
            <Input type="email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} placeholder="cliente@exemplo.com" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Plano mensal" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Frequência</Label>
              <Select value={freqType} onValueChange={(v) => setFreqType(v as typeof freqType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Dias</SelectItem>
                  <SelectItem value="weeks">Semanas</SelectItem>
                  <SelectItem value="months">Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>A cada</Label>
              <Input value={freq} onChange={(e) => setFreq(e.target.value)} type="number" min={1} />
            </div>
            <div>
              <Label>Máx. cobranças</Label>
              <Input value={maxCharges} onChange={(e) => setMaxCharges(e.target.value)} type="number" min={1} placeholder="∞" />
            </div>
          </div>
          <div>
            <Label>Primeira cobrança</Label>
            <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Criando…" : "Criar e abrir MP"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
