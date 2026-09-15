import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  addStoreCredit,
  getStoreCreditBalance,
  listStoreCreditMovements,
} from "@/lib/pdv-store-credit.functions";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  formatCpf, formatPhoneBR, isValidCpf, onlyDigits, upsertCustomer,
} from "@/lib/pdv-customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Search, Plus, Cake, Clock, TrendingUp, Wallet, Download, X, Save,
} from "lucide-react";

export const Route = createFileRoute("/pdv/clientes")({
  component: ClientesPage,
});

type CustomerStats = {
  id: string;
  name: string;
  cpf: string;
  phone: string | null;
  email: string | null;
  tier: string;
  cashback: number;
  birthday: string | null;
  tags: string[];
  created_at: string;
  sales_count: number;
  total_spent: number;
  last_purchase_at: string | null;
  avg_ticket: number;
};

type Segment = "all" | "birthday" | "inactive" | "top" | "vip";

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

function daysBetween(iso: string | null) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

function ClientesPage() {
  const { currentStoreId, currentStore, loading } = useCurrentStore();
  const qc = useQueryClient();
  const [segment, setSegment] = React.useState<Segment>("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<CustomerStats | null>(null);
  const [creating, setCreating] = React.useState(false);

  const q = useQuery({
    queryKey: ["crm-customers", currentStoreId ?? "all"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_customers_with_stats", {
        _store_id: currentStoreId as string,
      });
      if (error) throw error;
      return (data ?? []).map((r: CustomerStats) => ({
        ...r,
        cashback: Number(r.cashback),
        total_spent: Number(r.total_spent),
        avg_ticket: Number(r.avg_ticket),
        sales_count: Number(r.sales_count),
      })) as CustomerStats[];
    },
    enabled: !loading,
  });

  const all = q.data ?? [];
  const currentMonth = new Date().getMonth() + 1;

  const filtered = React.useMemo(() => {
    let list = all;
    if (segment === "birthday") {
      list = list.filter((c) => c.birthday && new Date(c.birthday + "T00:00").getMonth() + 1 === currentMonth);
    } else if (segment === "inactive") {
      list = list.filter((c) => c.sales_count > 0 && daysBetween(c.last_purchase_at) >= 60);
    } else if (segment === "top") {
      list = [...list].sort((a, b) => b.total_spent - a.total_spent).slice(0, 20);
    } else if (segment === "vip") {
      list = list.filter((c) => c.tier === "Ouro" || c.tier === "Prata" || c.total_spent >= 1000);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      const digits = onlyDigits(search);
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          (digits && c.cpf.includes(digits)) ||
          (c.email ?? "").toLowerCase().includes(s) ||
          (c.phone ?? "").includes(digits),
      );
    }
    return list;
  }, [all, segment, search, currentMonth]);

  const kpis = React.useMemo(() => {
    const now = new Date();
    const thisMonth = all.filter((c) => new Date(c.created_at).getMonth() === now.getMonth() && new Date(c.created_at).getFullYear() === now.getFullYear()).length;
    const birthdays = all.filter((c) => c.birthday && new Date(c.birthday + "T00:00").getMonth() + 1 === currentMonth).length;
    const inactive = all.filter((c) => c.sales_count > 0 && daysBetween(c.last_purchase_at) >= 60).length;
    const cashback = all.reduce((s, c) => s + c.cashback, 0);
    return { thisMonth, birthdays, inactive, cashback };
  }, [all, currentMonth]);

  function exportCsv() {
    const lines = [
      "Nome;CPF;Telefone;Email;Tier;Cashback;Nascimento;Vendas;Total gasto;Ticket médio;Última compra",
      ...filtered.map((c) =>
        [c.name, formatCpf(c.cpf), c.phone ?? "", c.email ?? "", c.tier,
         c.cashback.toFixed(2), c.birthday ?? "", c.sales_count,
         c.total_spent.toFixed(2), c.avg_ticket.toFixed(2), c.last_purchase_at ?? "",
        ].join(";"),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${segment}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-5 w-5" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentStore ? `${currentStore.name} — ${all.length} cadastro(s)` : `${all.length} cadastro(s) — todas as lojas`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo cliente
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Novos no mês" value={String(kpis.thisMonth)} />
        <StatCard icon={<Cake className="h-4 w-4" />} label="Aniversariantes" value={String(kpis.birthdays)} tone="pink" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Inativos 60d+" value={String(kpis.inactive)} tone="amber" />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Cashback total" value={brl(kpis.cashback)} tone="emerald" />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {(["all", "birthday", "inactive", "top", "vip"] as Segment[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={segment === s ? "default" : "outline"}
                className="h-8"
                onClick={() => setSegment(s)}
              >
                {s === "all" && "Todos"}
                {s === "birthday" && "Aniversariantes do mês"}
                {s === "inactive" && "Inativos 60d+"}
                {s === "top" && "Top 20"}
                {s === "vip" && "VIP"}
              </Button>
            ))}
            <Link to="/pdv/crm" className="h-8 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent">
              Kanban & Agendas
            </Link>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, CPF, telefone…"
              className="h-9 pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Contato</th>
                  <th className="px-3 py-2 text-center">Tier</th>
                  <th className="px-3 py-2 text-right">Vendas</th>
                  <th className="px-3 py-2 text-right">Total gasto</th>
                  <th className="px-3 py-2 text-right">Última compra</th>
                  <th className="px-3 py-2 text-right">Cashback</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">Carregando…</td></tr>
                )}
                {!q.isLoading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum cliente neste segmento.</td></tr>
                )}
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t border-border/60 hover:bg-muted/40"
                    onClick={() => setSelected(c)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{formatCpf(c.cpf)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.phone && <div>{formatPhoneBR(c.phone)}</div>}
                      {c.email && <div className="text-muted-foreground">{c.email}</div>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline">{c.tier}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">{c.sales_count}</td>
                    <td className="px-3 py-2 text-right font-medium">{brl(c.total_spent)}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {c.last_purchase_at ? new Date(c.last_purchase_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{brl(c.cashback)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CustomerDrawer
        customer={selected}
        storeId={currentStoreId}
        onClose={() => setSelected(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["crm-customers"] });
        }}
      />

      <NewCustomerDialog
        open={creating}
        storeId={currentStoreId}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ["crm-customers"] });
        }}
      />
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "pink" | "amber" | "emerald" }) {
  const cls =
    tone === "pink" ? "text-pink-600 bg-pink-500/10"
    : tone === "amber" ? "text-amber-600 bg-amber-500/10"
    : tone === "emerald" ? "text-emerald-600 bg-emerald-500/10"
    : "text-muted-foreground bg-muted";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`grid h-7 w-7 place-items-center rounded-md ${cls}`}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

/* ============================================================
 * Drawer 360
 * ============================================================ */
type TimelineItem = {
  event_kind: "sale" | "pix" | "receivable";
  event_at: string;
  description: string;
  amount: number;
  extra: Record<string, unknown>;
};

function CustomerDrawer({
  customer, storeId, onClose, onSaved,
}: {
  customer: CustomerStats | null;
  storeId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<Partial<CustomerStats>>({});
  const [saving, setSaving] = React.useState(false);
  const [tagsInput, setTagsInput] = React.useState("");

  React.useEffect(() => {
    if (customer) {
      setForm(customer);
      setTagsInput((customer.tags ?? []).join(", "));
    }
  }, [customer]);

  const timeline = useQuery({
    queryKey: ["customer-360", customer?.id, storeId],
    enabled: !!customer,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_360", {
        _customer_id: customer!.id,
        _store_id: storeId ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        event_kind: r.event_kind as TimelineItem["event_kind"],
        amount: Number(r.amount),
        extra: (r.extra ?? {}) as Record<string, unknown>,
      })) as TimelineItem[];
    },
  });

  async function save() {
    if (!customer) return;
    setSaving(true);
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      const { error } = await supabase.from("customers").update({
        name: form.name?.trim() ?? customer.name,
        phone: form.phone ? onlyDigits(form.phone) : null,
        email: form.email?.trim() || null,
        birthday: form.birthday || null,
        tier: form.tier ?? customer.tier,
        tags,
      }).eq("id", customer.id);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e) {
      alert("Falha ao salvar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-xl">
        {customer && (
          <>
            <SheetHeader>
              <SheetTitle>{customer.name}</SheetTitle>
              <SheetDescription>{formatCpf(customer.cpf)}</SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Vendas" value={String(customer.sales_count)} />
              <MiniStat label="Gasto total" value={brl(customer.total_spent)} />
              <MiniStat label="Ticket médio" value={brl(customer.avg_ticket)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={100} />
              </Field>
              <Field label="Telefone">
                <Input value={formatPhoneBR(form.phone ?? "")} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} maxLength={16} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} maxLength={200} />
              </Field>
              <Field label="Aniversário">
                <Input type="date" value={form.birthday ?? ""} onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))} />
              </Field>
              <Field label="Tier">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={form.tier ?? "Bronze"}
                  onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
                >
                  <option>Bronze</option>
                  <option>Prata</option>
                  <option>Ouro</option>
                </select>
              </Field>
              <Field label="Cashback">
                <Input value={brl(customer.cashback)} disabled />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Tags (separadas por vírgula)">
                  <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ex: fiel, atacado, vip" />
                </Field>
              </div>
            </div>

            {storeId && (
              <StoreCreditPanel customerId={customer.id} storeId={storeId} />
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
              {timeline.isLoading && <div className="text-xs text-muted-foreground">Carregando…</div>}
              {timeline.data && timeline.data.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Sem histórico ainda.
                </div>
              )}
              {timeline.data && timeline.data.length > 0 && (
                <ul className="space-y-1">
                  {timeline.data.slice(0, 30).map((e, i) => (
                    <li key={i} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          e.event_kind === "sale" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : e.event_kind === "pix" ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                          {e.event_kind === "sale" ? "Venda" : e.event_kind === "pix" ? "PIX" : "A receber"}
                        </span>
                        <span>{e.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{brl(e.amount)}</span>
                        <span className="text-muted-foreground">{new Date(e.event_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-auto flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={onClose}><X className="mr-1.5 h-4 w-4" /> Fechar</Button>
              <Button onClick={save} disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* ============================================================
 * Novo cliente
 * ============================================================ */
function NewCustomerDialog({ open, storeId, onClose, onCreated }: { open: boolean; storeId: string | null; onClose: () => void; onCreated: () => void }) {
  const [cpf, setCpf] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [birthday, setBirthday] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setCpf(""); setName(""); setPhone(""); setEmail(""); setBirthday(""); setNotes("");
    }
  }, [open]);

  async function submit() {
    if (!storeId) { alert("Selecione uma loja antes de cadastrar."); return; }
    if (!isValidCpf(cpf)) { alert("CPF inválido."); return; }
    if (name.trim().length < 2) { alert("Nome muito curto."); return; }
    setBusy(true);
    try {
      const c = await upsertCustomer({ cpf, name, phone, tier: "Bronze", cashback: 0, storeId });
      if (email || birthday || notes) {
        await supabase.from("customers").update({
          email: email || null,
          birthday: birthday || null,
          notes: notes || null,
        }).eq("id", c.id);
      }
      onCreated();
    } catch (e) {
      alert("Falha ao criar cliente: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="CPF *">
            <Input value={formatCpf(cpf)} onChange={(e) => setCpf(e.target.value)} maxLength={14} />
          </Field>
          <Field label="Nome *">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone">
              <Input value={formatPhoneBR(phone)} onChange={(e) => setPhone(e.target.value)} maxLength={16} />
            </Field>
            <Field label="Aniversário">
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </Field>
          </div>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Observações">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Criando…" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Store Credit Panel (aba Créditos embutida no drawer)
 * ============================================================ */
function StoreCreditPanel({ customerId, storeId }: { customerId: string; storeId: string }) {
  const qc = useQueryClient();
  const getBalance = useServerFn(getStoreCreditBalance);
  const listMovs = useServerFn(listStoreCreditMovements);
  const addFn = useServerFn(addStoreCredit);
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const bal = useQuery({
    queryKey: ["store-credit-balance", customerId, storeId],
    queryFn: () => getBalance({ data: { customerId, storeId } }),
  });
  const movs = useQuery({
    queryKey: ["store-credit-movs", customerId, storeId],
    queryFn: () => listMovs({ data: { customerId, storeId } }),
  });

  async function submit() {
    const v = Number(amount.replace(",", "."));
    if (!v || v <= 0) return alert("Informe um valor válido");
    setBusy(true);
    try {
      await addFn({ data: { customerId, storeId, amount: v, source: "manual", note: note || undefined } });
      setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["store-credit-balance", customerId, storeId] });
      qc.invalidateQueries({ queryKey: ["store-credit-movs", customerId, storeId] });
    } catch (e) {
      alert("Falha: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Crédito da Loja</h3>
        <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
          {brl(Number(bal.data ?? 0))}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
        <Input placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        <Input placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        <Button size="sm" onClick={submit} disabled={busy}>{busy ? "…" : "Adicionar"}</Button>
      </div>
      {movs.data && movs.data.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {movs.data.slice(0, 20).map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded border border-border/60 px-2 py-1 text-xs">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  m.type === "credit" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : m.type === "debit" ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>{m.type}</span>
                <span className="truncate">{m.note ?? m.source}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{brl(Number(m.amount))}</span>
                <span className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {movs.data && movs.data.length === 0 && (
        <div className="mt-3 text-center text-xs text-muted-foreground">Sem movimentações.</div>
      )}
    </div>
  );
}
