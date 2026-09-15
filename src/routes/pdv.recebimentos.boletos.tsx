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
import { FileText, Plus, CheckCircle2, XCircle, Copy, ExternalLink, Receipt } from "lucide-react";

export const Route = createFileRoute("/pdv/recebimentos/boletos")({
  component: BoletosPage,
});

type BoletoRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  amount: number;
  due_date: string;
  status: "open" | "paid" | "overdue" | "cancelled";
  barcode: string | null;
  digitable_line: string | null;
  pdf_url: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  notes: string | null;
  created_at: string;
};

type Customer = { id: string; name: string; phone: string | null };

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const fmtDate = (s: string | null) =>
  s ? new Date(s + (s.includes("T") ? "" : "T00:00:00")).toLocaleDateString("pt-BR") : "—";

function StatusBadge({ s }: { s: BoletoRow["status"] }) {
  if (s === "paid") return <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="outline">Pago</Badge>;
  if (s === "overdue") return <Badge className="border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300" variant="outline">Vencido</Badge>;
  if (s === "cancelled") return <Badge variant="outline">Cancelado</Badge>;
  return <Badge variant="secondary">Em aberto</Badge>;
}

function BoletosPage() {
  const { user } = usePdvAuth();
  const { currentStoreId, loading } = useCurrentStore();
  const qc = useQueryClient();
  const [scope, setScope] = React.useState<"all" | "open" | "overdue" | "paid" | "cancelled">("all");
  const [openNew, setOpenNew] = React.useState(false);
  const canManage = user?.role === "admin" || user?.role === "manager";
  const storeId = currentStoreId;

  const list = useQuery({
    queryKey: ["boletos", storeId, scope],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_boletos", {
        _store: storeId as string,
        _status: scope === "all" ? null : scope,
      });
      if (error) throw error;
      return (data ?? []) as BoletoRow[];
    },
    enabled: !!storeId,
    refetchInterval: 30000,
  });

  async function markPaid(id: string, amount: number) {
    const raw = prompt("Valor pago", String(amount));
    if (raw === null) return;
    const val = Number(raw.replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) return toast.error("Valor inválido");
    const { error } = await (supabase.rpc as any)("mark_boleto_paid", { _id: id, _amount: val });
    if (error) return toast.error(error.message);
    toast.success("Boleto baixado");
    qc.invalidateQueries({ queryKey: ["boletos"] });
  }

  async function cancel(id: string) {
    if (!confirm("Cancelar este boleto?")) return;
    const { error } = await (supabase.rpc as any)("cancel_boleto", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Boleto cancelado");
    qc.invalidateQueries({ queryKey: ["boletos"] });
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado");
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
          <p className="text-sm text-muted-foreground">Boletos manuais com baixa automática no financeiro.</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpenNew(true)}><Plus className="mr-2 h-4 w-4" /> Novo boleto</Button>
        )}
      </header>

      <nav className="flex flex-wrap gap-1 rounded-md bg-muted p-1 text-sm">
        <Link to="/pdv/recebimentos" className="rounded px-3 py-1.5 hover:bg-background/60">Links</Link>
        <Link to="/pdv/recebimentos/boletos" className="rounded px-3 py-1.5 bg-background shadow-sm font-medium">Boletos</Link>
        <Link to="/pdv/recebimentos/agendamentos" className="rounded px-3 py-1.5 hover:bg-background/60">Agendamentos</Link>
        <Link to="/pdv/recebimentos/assinaturas" className="rounded px-3 py-1.5 hover:bg-background/60">Assinaturas</Link>
      </nav>

      <Card>
        <CardHeader>
          <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="open">Em aberto</TabsTrigger>
              <TabsTrigger value="overdue">Vencidos</TabsTrigger>
              <TabsTrigger value="paid">Pagos</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-left">Situação</th>
                  <th className="px-3 py-2 text-left">Linha / código</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
                {!list.isLoading && (list.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum boleto.</td></tr>
                )}
                {(list.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.status === "paid" ? brl(Number(r.paid_amount ?? r.amount)) : brl(r.amount)}
                    </td>
                    <td className="px-3 py-2">{fmtDate(r.due_date)}</td>
                    <td className="px-3 py-2"><StatusBadge s={r.status} /></td>
                    <td className="px-3 py-2 max-w-[220px] truncate font-mono text-xs">
                      {r.digitable_line || r.barcode || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {r.digitable_line && (
                          <Button size="sm" variant="ghost" onClick={() => copy(r.digitable_line!)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {r.pdf_url && (
                          <Button size="sm" variant="ghost" onClick={() => window.open(r.pdf_url!, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && (r.status === "open" || r.status === "overdue") && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => markPaid(r.id, Number(r.amount))}>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                              <XCircle className="h-3.5 w-3.5 text-rose-500" />
                            </Button>
                          </>
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
        <NewBoletoDialog
          storeId={storeId}
          onClose={() => setOpenNew(false)}
          onCreated={() => {
            setOpenNew(false);
            qc.invalidateQueries({ queryKey: ["boletos"] });
          }}
        />
      )}
    </div>
  );
}

function NewBoletoDialog({ storeId, onClose, onCreated }: {
  storeId: string; onClose: () => void; onCreated: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [due, setDue] = React.useState(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10));
  const [customerId, setCustomerId] = React.useState("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [digitable, setDigitable] = React.useState("");
  const [pdf, setPdf] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const customers = useQuery({
    queryKey: ["customers-mini-boletos", customerSearch],
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
    if (!due) return toast.error("Vencimento obrigatório");
    setSaving(true);
    const { error } = await (supabase.rpc as any)("create_boleto", {
      _store: storeId,
      _customer: customerId || null,
      _amount: amt,
      _due: due,
      _barcode: barcode || null,
      _digitable: digitable || null,
      _pdf: pdf || null,
      _notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Boleto cadastrado");
    onCreated();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo boleto</DialogTitle>
          <DialogDescription>Cadastre um boleto manual (linha digitável / PDF).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Cliente (opcional)</Label>
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
          <div>
            <Label>Linha digitável</Label>
            <Input value={digitable} onChange={(e) => setDigitable(e.target.value)} placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Código de barras</Label>
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </div>
            <div>
              <Label>URL do PDF</Label>
              <Input value={pdf} onChange={(e) => setPdf(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
