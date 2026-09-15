import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock, Plus, MessageCircle, Play, Pause, CheckCircle2, Receipt,
} from "lucide-react";

export const Route = createFileRoute("/pdv/recebimentos/agendamentos")({
  component: SchedulesPage,
});

type Schedule = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  title: string;
  amount: number | null;
  cadence: "once" | "daily" | "weekly" | "monthly";
  next_run_at: string;
  active: boolean;
  occurrences: number;
  max_occurrences: number | null;
  last_run_at: string | null;
  message: string;
  created_at: string;
};

type Reminder = {
  id: string;
  schedule_id: string | null;
  customer_id: string;
  customer_name: string;
  channel: string;
  message: string;
  wa_url: string | null;
  status: "queued" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  created_at: string;
};

type Customer = { id: string; name: string; phone: string | null };

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
const fmtDate = (s: string | null) => s ? new Date(s + (s.includes("T") ? "" : "T00:00:00")).toLocaleDateString("pt-BR") : "—";
const fmtDT = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const cadenceLabel = (c: string) => ({ once: "Único", daily: "Diário", weekly: "Semanal", monthly: "Mensal" }[c] ?? c);

function SchedulesPage() {
  const { user } = usePdvAuth();
  const { currentStoreId, loading } = useCurrentStore();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"schedules" | "reminders">("schedules");
  const [openNew, setOpenNew] = React.useState(false);
  const canManage = user?.role === "admin" || user?.role === "manager";
  const storeId = currentStoreId;

  const schedules = useQuery({
    queryKey: ["psched", storeId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_payment_schedules", { _store: storeId as string });
      if (error) throw error;
      return (data ?? []) as Schedule[];
    },
    enabled: !!storeId,
  });

  const reminders = useQuery({
    queryKey: ["preminders", storeId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_payment_reminders", { _store: storeId as string, _limit: 100 });
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
    enabled: !!storeId,
    refetchInterval: 30000,
  });

  async function toggle(id: string, active: boolean) {
    const { error } = await (supabase.rpc as any)("toggle_payment_schedule", { _id: id, _active: active });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["psched"] });
  }

  async function markSent(id: string) {
    const { error } = await (supabase.rpc as any)("mark_reminder_sent", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Marcado como enviado");
    qc.invalidateQueries({ queryKey: ["preminders"] });
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
          <p className="text-sm text-muted-foreground">Cobranças agendadas por WhatsApp (uma vez, diário, semanal, mensal).</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpenNew(true)}><Plus className="mr-2 h-4 w-4" /> Novo agendamento</Button>
        )}
      </header>

      <nav className="flex flex-wrap gap-1 rounded-md bg-muted p-1 text-sm">
        <Link to="/pdv/recebimentos" className="rounded px-3 py-1.5 hover:bg-background/60">Links</Link>
        <Link to="/pdv/recebimentos/boletos" className="rounded px-3 py-1.5 hover:bg-background/60">Boletos</Link>
        <Link to="/pdv/recebimentos/agendamentos" className="rounded px-3 py-1.5 bg-background shadow-sm font-medium">Agendamentos</Link>
        <Link to="/pdv/recebimentos/assinaturas" className="rounded px-3 py-1.5 hover:bg-background/60">Assinaturas</Link>
      </nav>

      <Card>
        <CardHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="schedules">Agendas ({schedules.data?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="reminders">Lembretes gerados</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          {tab === "schedules" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Título</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-left">Cadência</th>
                    <th className="px-3 py-2 text-left">Próximo envio</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
                  {!schedules.isLoading && (schedules.data ?? []).length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum agendamento.</td></tr>
                  )}
                  {(schedules.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/40">
                      <td className="px-3 py-2">{r.customer_name}</td>
                      <td className="px-3 py-2">{r.title}</td>
                      <td className="px-3 py-2 text-right">{r.amount ? brl(Number(r.amount)) : "—"}</td>
                      <td className="px-3 py-2">{cadenceLabel(r.cadence)}</td>
                      <td className="px-3 py-2">{fmtDate(r.next_run_at)}</td>
                      <td className="px-3 py-2">
                        {r.active
                          ? <Badge variant="secondary">Ativo</Badge>
                          : <Badge variant="outline">Pausado</Badge>}
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {r.occurrences}{r.max_occurrences ? `/${r.max_occurrences}` : ""} envios
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {canManage && (
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" onClick={() => toggle(r.id, !r.active)}>
                              {r.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Mensagem</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Criado</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {reminders.isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
                  {!reminders.isLoading && (reminders.data ?? []).length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum lembrete.</td></tr>
                  )}
                  {(reminders.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/40">
                      <td className="px-3 py-2">{r.customer_name}</td>
                      <td className="px-3 py-2 max-w-md">
                        <div className="line-clamp-2 text-xs">{r.message}</div>
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "sent"
                          ? <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="outline">Enviado</Badge>
                          : r.status === "queued" ? <Badge variant="secondary">Fila</Badge>
                          : <Badge variant="outline">{r.status}</Badge>}
                        {r.sent_at && <div className="text-[10px] text-muted-foreground">{fmtDT(r.sent_at)}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDT(r.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {r.wa_url && (
                            <Button size="sm" variant="ghost" onClick={() => window.open(r.wa_url!, "_blank")}>
                              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                            </Button>
                          )}
                          {canManage && r.status !== "sent" && (
                            <Button size="sm" variant="ghost" onClick={() => markSent(r.id)}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {openNew && (
        <NewScheduleDialog
          storeId={storeId}
          onClose={() => setOpenNew(false)}
          onCreated={() => { setOpenNew(false); qc.invalidateQueries({ queryKey: ["psched"] }); }}
        />
      )}
    </div>
  );
}

function NewScheduleDialog({ storeId, onClose, onCreated }: {
  storeId: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [cadence, setCadence] = React.useState<"once" | "daily" | "weekly" | "monthly">("weekly");
  const [next, setNext] = React.useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = React.useState("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [message, setMessage] = React.useState(
    "Oi {cliente}! Passando para lembrar do {titulo} no valor de {valor} (venc. {vencimento}). Qualquer dúvida estou por aqui!"
  );
  const [maxOcc, setMaxOcc] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const customers = useQuery({
    queryKey: ["customers-mini-sched", customerSearch],
    queryFn: async () => {
      const q = supabase.from("customers").select("id,name,phone").limit(20);
      if (customerSearch.trim()) q.ilike("name", `%${customerSearch.trim()}%`);
      const { data } = await q;
      return (data ?? []) as Customer[];
    },
  });

  async function save() {
    if (!customerId) return toast.error("Selecione um cliente");
    if (!title.trim()) return toast.error("Título obrigatório");
    if (!message.trim()) return toast.error("Mensagem obrigatória");
    const amt = amount.trim() ? Number(amount.replace(",", ".")) : null;
    setSaving(true);
    const { error } = await (supabase.rpc as any)("create_payment_schedule", {
      _store: storeId,
      _customer: customerId,
      _title: title.trim(),
      _amount: amt,
      _cadence: cadence,
      _next: next,
      _message: message.trim(),
      _max_occ: maxOcc ? Number(maxOcc) : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Agendamento criado");
    onCreated();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Envio recorrente de cobrança por WhatsApp.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Cliente</Label>
            <Input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); }} placeholder="Buscar cliente…" />
            {customerSearch && (customers.data ?? []).length > 0 && !customerId && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded border bg-popover">
                {(customers.data ?? []).map((c) => (
                  <button key={c.id} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); }}>
                    {c.name} {c.phone && <span className="text-xs text-muted-foreground">· {c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Mensalidade" />
            </div>
            <div>
              <Label>Valor (opcional)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Cadência</Label>
              <Select value={cadence} onValueChange={(v) => setCadence(v as typeof cadence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Único</SelectItem>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primeiro envio</Label>
              <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <Label>Máx. envios</Label>
              <Input value={maxOcc} onChange={(e) => setMaxOcc(e.target.value)} type="number" min={1} placeholder="∞" />
            </div>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Variáveis: {"{cliente}"} {"{titulo}"} {"{valor}"} {"{vencimento}"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
