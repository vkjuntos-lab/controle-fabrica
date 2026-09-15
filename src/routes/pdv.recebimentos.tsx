import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { usePdvAuth } from "@/lib/pdv-auth";
import { createMPPreference } from "@/lib/pdv-payment-links.functions";
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
  Receipt, Plus, Search, Link as LinkIcon, Copy, MessageCircle, XCircle,
  CheckCircle2, Clock, TrendingUp, Ban, ExternalLink, QrCode, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/pdv/recebimentos")({
  component: RecebimentosPage,
});

type LinkStatus = "pending" | "paid" | "expired" | "canceled";

type LinkRow = {
  id: string;
  code: string;
  description: string;
  amount: number;
  status: LinkStatus;
  methods: string[];
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  paid_method: string | null;
  mp_init_point: string | null;
};

type Customer = { id: string; name: string; phone: string | null };

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const fmtDT = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function publicUrl(code: string) {
  return `${window.location.origin}/pay/${code}`;
}

function methodLabels(methods: string[]): string {
  const map: Record<string, string> = { pix: "PIX", credit: "Crédito", debit: "Débito" };
  return methods.map((m) => map[m] ?? m).join(" · ");
}

function StatusBadge({ status }: { status: LinkStatus }) {
  if (status === "paid") return <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="outline">Pago</Badge>;
  if (status === "expired") return <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="outline">Expirado</Badge>;
  if (status === "canceled") return <Badge variant="outline">Cancelado</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

function RecebimentosPage() {
  const { user } = usePdvAuth();
  const { currentStoreId, loading } = useCurrentStore();
  const qc = useQueryClient();
  const [scope, setScope] = React.useState<"pending" | "paid" | "expired" | "canceled" | "all">("pending");
  const [search, setSearch] = React.useState("");
  const [openNew, setOpenNew] = React.useState(false);
  const [detailFor, setDetailFor] = React.useState<LinkRow | null>(null);
  const canManage = user?.role === "admin" || user?.role === "manager";
  const storeId = currentStoreId;

  const list = useQuery({
    queryKey: ["payment-links", storeId, scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_payment_links", {
        _store_id: storeId as string,
        _scope: scope,
      });
      if (error) throw error;
      return (data ?? []) as LinkRow[];
    },
    enabled: !!storeId,
    refetchInterval: 15000,
  });

  const dash = useQuery({
    queryKey: ["payment-links-dash", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_links")
        .select("status,amount,paid_amount,paid_at,created_at")
        .eq("store_id", storeId as string);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const active = rows.filter((r) => r.status === "pending").length;
      const paidToday = rows.filter((r) => r.status === "paid" && r.paid_at && new Date(r.paid_at) >= today);
      const paidTodayAmount = paidToday.reduce((s, r) => s + Number(r.paid_amount ?? r.amount), 0);
      const expired = rows.filter((r) => r.status === "expired").length;
      const paidAll = rows.filter((r) => r.status === "paid");
      const avg = paidAll.length
        ? paidAll.reduce((s, r) => s + Number(r.paid_amount ?? r.amount), 0) / paidAll.length
        : 0;
      return { active, paidTodayCount: paidToday.length, paidTodayAmount, expired, avg };
    },
    enabled: !!storeId,
    refetchInterval: 30000,
  });

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list.data ?? [];
    return (list.data ?? []).filter(
      (r) =>
        r.code.toLowerCase().includes(s) ||
        r.description.toLowerCase().includes(s) ||
        (r.customer_name ?? "").toLowerCase().includes(s) ||
        (r.customer_phone ?? "").toLowerCase().includes(s),
    );
  }, [list.data, search]);

  async function copyLink(code: string) {
    await navigator.clipboard.writeText(publicUrl(code));
    toast.success("Link copiado!");
  }

  function waLink(row: LinkRow) {
    const digits = (row.customer_phone ?? "").replace(/\D+/g, "");
    if (!digits) {
      toast.error("Cliente sem telefone");
      return;
    }
    const msg = `Olá${row.customer_name ? ` ${row.customer_name.split(" ")[0]}` : ""}! Segue o link para pagamento (${brl(row.amount)}): ${publicUrl(row.code)}`;
    const phone = digits.length === 11 ? "55" + digits : digits;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function cancelLink(id: string) {
    if (!confirm("Cancelar este link?")) return;
    const { error } = await supabase.rpc("cancel_payment_link", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Link cancelado");
    qc.invalidateQueries({ queryKey: ["payment-links"] });
  }

  async function markExpired() {
    const { data, error } = await supabase.rpc("mark_expired_payment_links");
    if (error) return toast.error(error.message);
    toast.success(`${data ?? 0} link(s) expirado(s)`);
    qc.invalidateQueries({ queryKey: ["payment-links"] });
    qc.invalidateQueries({ queryKey: ["payment-links-dash"] });
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!storeId) return (
    <div className="p-6">
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        Selecione uma loja para acessar recebimentos.
      </CardContent></Card>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Receipt className="h-6 w-6 text-primary" /> Central de Recebimentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Links de pagamento (PIX + Cartão) via Mercado Pago, com baixa automática.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={markExpired}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar vencidos
          </Button>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo link
          </Button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-md bg-muted p-1 text-sm">
        <Link to="/pdv/recebimentos" className="rounded px-3 py-1.5 bg-background shadow-sm font-medium">Links</Link>
        <Link to="/pdv/recebimentos/boletos" className="rounded px-3 py-1.5 hover:bg-background/60">Boletos</Link>
        <Link to="/pdv/recebimentos/agendamentos" className="rounded px-3 py-1.5 hover:bg-background/60">Agendamentos</Link>
        <Link to="/pdv/recebimentos/assinaturas" className="rounded px-3 py-1.5 hover:bg-background/60">Assinaturas</Link>
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Links ativos" value={String(dash.data?.active ?? 0)} icon={<LinkIcon className="h-4 w-4" />} />
        <Kpi label="Pagos hoje" value={brl(dash.data?.paidTodayAmount ?? 0)}
             sub={`${dash.data?.paidTodayCount ?? 0} pagamentos`}
             icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} />
        <Kpi label="Expirados" value={String(dash.data?.expired ?? 0)} icon={<Clock className="h-4 w-4 text-amber-500" />} />
        <Kpi label="Ticket médio" value={brl(dash.data?.avg ?? 0)} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <TabsList>
              <TabsTrigger value="pending">Pendentes</TabsTrigger>
              <TabsTrigger value="paid">Pagos</TabsTrigger>
              <TabsTrigger value="expired">Expirados</TabsTrigger>
              <TabsTrigger value="canceled">Cancelados</TabsTrigger>
              <TabsTrigger value="all">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Código, cliente, descrição…"
                   value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Cliente / descrição</th>
                  <th className="px-3 py-2 text-left">Métodos</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Situação</th>
                  <th className="px-3 py-2 text-left">Criado / expira</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>
                )}
                {!list.isLoading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum link.</td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs uppercase">{r.code}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.customer_name ?? "—"}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">{r.description}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{methodLabels(r.methods)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.status === "paid" ? brl(Number(r.paid_amount ?? r.amount)) : brl(r.amount)}
                      {r.status === "paid" && r.paid_method && (
                        <div className="text-[10px] uppercase text-muted-foreground">{r.paid_method}</div>
                      )}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {fmtDT(r.created_at)}
                      {r.expires_at && r.status === "pending" && (
                        <div>expira {fmtDT(r.expires_at)}</div>
                      )}
                      {r.paid_at && r.status === "paid" && (
                        <div className="text-emerald-600">pago {fmtDT(r.paid_at)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDetailFor(r)}>
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => copyLink(r.code)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {r.customer_phone && (
                          <Button size="sm" variant="ghost" onClick={() => waLink(r)}>
                            <MessageCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {r.status === "pending" && canManage && (
                          <Button size="sm" variant="ghost" onClick={() => cancelLink(r.id)}>
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
        <NewLinkDialog
          storeId={storeId}
          onClose={() => setOpenNew(false)}
          onCreated={(row) => {
            setOpenNew(false);
            setDetailFor(row);
            qc.invalidateQueries({ queryKey: ["payment-links"] });
            qc.invalidateQueries({ queryKey: ["payment-links-dash"] });
          }}
        />
      )}

      {detailFor && (
        <LinkDetailDialog row={detailFor} onClose={() => setDetailFor(null)} />
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

/* ============ New link dialog ============ */

function NewLinkDialog({
  storeId, onClose, onCreated,
}: { storeId: string; onClose: () => void; onCreated: (row: LinkRow) => void }) {
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [methods, setMethods] = React.useState<Record<"pix" | "credit" | "debit", boolean>>({
    pix: true, credit: true, debit: true,
  });
  const [maxInst, setMaxInst] = React.useState("1");
  const [expiresHours, setExpiresHours] = React.useState("48");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const createPref = useServerFn(createMPPreference);

  const customers = useQuery({
    queryKey: ["customers-mini-links", customerSearch],
    queryFn: async () => {
      const q = supabase.from("customers").select("id,name,phone").limit(20);
      if (customerSearch.trim()) q.ilike("name", `%${customerSearch.trim()}%`);
      const { data } = await q;
      return (data ?? []) as Customer[];
    },
  });

  async function save() {
    const amt = Number(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Valor inválido");
    if (!description.trim()) return toast.error("Descrição obrigatória");
    const active = (["pix", "credit", "debit"] as const).filter((m) => methods[m]);
    if (active.length === 0) return toast.error("Selecione ao menos um método");

    setSaving(true);
    const { data, error } = await supabase.rpc("create_payment_link", {
      _store: storeId,
      _amount: amt,
      _description: description.trim(),
      _methods: active,
      _max_installments: Number(maxInst) || 1,
      _expires_at: new Date(Date.now() + Number(expiresHours) * 3600_000).toISOString(),
      _customer: customerId || undefined,
      _notes: notes || undefined,
    });
    if (error) { setSaving(false); return toast.error(error.message); }
    const row = ((data as any[]) ?? [])[0];
    if (!row) { setSaving(false); return toast.error("Falha ao criar link"); }

    // Gera Preference MP (não bloqueia o UX; segue mesmo se falhar)
    try {
      await createPref({ data: { linkId: row.id } });
    } catch (e) {
      toast.error(`Link criado, mas Mercado Pago falhou: ${(e as Error).message}`);
    }

    // Recarrega o link completo
    const { data: full } = await supabase
      .rpc("list_payment_links", { _store_id: storeId, _scope: "all" });
    const created = ((full as any[]) ?? []).find((r) => r.id === row.id);
    setSaving(false);
    if (created) onCreated(created as LinkRow);
    else onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo link de pagamento</DialogTitle>
          <DialogDescription>Gera um link seguro para o cliente pagar (PIX ou cartão).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <div>
              <Label>Expira em (horas)</Label>
              <Input value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} type="number" min={1} />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Kit maquiagem completo" />
          </div>
          <div>
            <Label>Cliente (opcional)</Label>
            <Input
              value={customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); }}
              placeholder="Buscar cliente…"
            />
            {customerSearch && (customers.data ?? []).length > 0 && !customerId && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded border bg-popover">
                {(customers.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); }}
                  >
                    {c.name} {c.phone && <span className="text-xs text-muted-foreground">· {c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Métodos aceitos</Label>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {(["pix", "credit", "debit"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1">
                  <input type="checkbox" checked={methods[m]}
                    onChange={(e) => setMethods({ ...methods, [m]: e.target.checked })} />
                  {m === "pix" ? "PIX" : m === "credit" ? "Crédito" : "Débito"}
                </label>
              ))}
            </div>
          </div>
          {methods.credit && (
            <div>
              <Label>Máximo de parcelas (crédito)</Label>
              <Select value={maxInst} onValueChange={setMaxInst}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Observações (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Gerando…" : "Gerar link"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Detail dialog (QR + copy + WA) ============ */

function LinkDetailDialog({ row, onClose }: { row: LinkRow; onClose: () => void }) {
  const url = publicUrl(row.code);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  }

  function wa() {
    const digits = (row.customer_phone ?? "").replace(/\D+/g, "");
    const msg = `Olá${row.customer_name ? ` ${row.customer_name.split(" ")[0]}` : ""}! Segue o link para pagamento (${brl(row.amount)}): ${url}`;
    if (!digits) {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      return;
    }
    const phone = digits.length === 11 ? "55" + digits : digits;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link #{row.code.toUpperCase()}</DialogTitle>
          <DialogDescription>{row.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-center">
            <div className="text-xs uppercase text-muted-foreground">Valor</div>
            <div className="text-3xl font-bold">{brl(row.amount)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{methodLabels(row.methods)}</div>
          </div>
          <div className="flex justify-center">
            <img src={qrSrc} alt="QR do link" className="rounded border bg-white p-2" />
          </div>
          <div className="rounded-md border bg-muted/30 p-2 text-center font-mono text-xs break-all">
            {url}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={copy}>
              <Copy className="mr-1 h-4 w-4" /> Copiar
            </Button>
            <Button variant="outline" onClick={wa}>
              <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
            </Button>
            <Button variant="outline" onClick={() => window.open(url, "_blank")}>
              <ExternalLink className="mr-1 h-4 w-4" /> Abrir
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
