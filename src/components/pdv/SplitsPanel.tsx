import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, UserPlus, RefreshCw, Wallet, CheckCircle2, AlertTriangle, X, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listRecipients, upsertRecipient, searchCustomersForRecipient,
  listSplitEntries, markSplitEntryStatus,
} from "@/lib/pdv-splits.functions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function exportCsv(rows: any[]) {
  const head = ["created_at", "status", "provider", "source_type", "source_id", "recipient_name", "amount", "percentage", "provider_ref", "error"];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [head.join(","), ...rows.map(r => head.map(k => esc(r[k])).join(","))].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `repasses-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

const statusStyle: Record<string, string> = {
  applied: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  error:   "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  manual:  "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

type Recipient = {
  id: string; name: string; cpf: string; phone: string | null;
  asaas_wallet_id: string | null; mp_collector_id: string | null; is_recipient: boolean;
};

export function SplitsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRecipients);
  const searchFn = useServerFn(searchCustomersForRecipient);
  const upsertFn = useServerFn(upsertRecipient);
  const listEntriesFn = useServerFn(listSplitEntries);
  const markEntryFn = useServerFn(markSplitEntryStatus);

  const [status, setStatus] = React.useState<"all" | "pending" | "applied" | "error" | "manual">("all");
  const [editing, setEditing] = React.useState<Recipient | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  const recipients = useQuery({ queryKey: ["splits-recipients"], queryFn: () => listFn() });
  const entries = useQuery({
    queryKey: ["splits-entries", status],
    queryFn: () => listEntriesFn({ data: { status } }),
    refetchInterval: 20_000,
  });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["splits-recipients"] });
    qc.invalidateQueries({ queryKey: ["splits-entries"] });
  };

  async function markStatus(id: string, s: "applied" | "manual" | "error" | "pending") {
    try {
      await markEntryFn({ data: { entryId: id, status: s } });
      toast.success("Repasse atualizado");
      qc.invalidateQueries({ queryKey: ["splits-entries"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function removeRecipient(id: string) {
    try {
      await upsertFn({ data: { customerId: id, isRecipient: false } });
      toast.success("Recebedor removido");
      qc.invalidateQueries({ queryKey: ["splits-recipients"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Recebedores (marketplace)</CardTitle>
            <CardDescription>Clientes marcados como recebedores de split. Reaproveita o cadastro de clientes.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refetchAll}><RefreshCw className="mr-1.5 h-4 w-4" />Atualizar</Button>
            <Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" />Adicionar</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recipients.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
          {recipients.data && recipients.data.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">Nenhum recebedor cadastrado.</p>
          )}
          <ul className="divide-y divide-border">
            {(recipients.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">CPF {r.cpf} · {r.phone ?? "sem telefone"}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                    <Badge variant="outline">Asaas: {r.asaas_wallet_id ?? "—"}</Badge>
                    <Badge variant="outline">MP: {r.mp_collector_id ?? "—"}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => removeRecipient(r.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Repasses</CardTitle>
            <CardDescription>Rateios registrados após aprovação de link/PIX. Total: {brl(entries.data?.total ?? 0)}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="applied">Aplicados</SelectItem>
                <SelectItem value="manual">Manuais</SelectItem>
                <SelectItem value="error">Com erro</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => exportCsv(entries.data?.rows ?? [])}>
              <Download className="mr-1.5 h-4 w-4" />CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
          {entries.data && entries.data.rows.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">Nenhum repasse registrado.</p>
          )}
          <ul className="divide-y divide-border">
            {(entries.data?.rows ?? []).map((r: any) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${statusStyle[r.status] ?? statusStyle.pending}`}>
                  {r.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.recipient_name ?? "—"} <span className="text-muted-foreground">· {brl(Number(r.amount))}</span>
                    {r.percentage != null && <span className="text-muted-foreground"> ({r.percentage}%)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.source_type === "payment_link" ? "Link" : "PIX"} · {r.provider} · {fmt(r.created_at)}
                    {r.provider_ref && <> · ref {r.provider_ref}</>}
                  </p>
                  {r.error && <p className="mt-0.5 text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{r.error}</p>}
                </div>
                {r.status !== "applied" && (
                  <Button size="sm" variant="outline" onClick={() => markStatus(r.id, "manual")}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Marcar repassado
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <AddRecipientDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["splits-recipients"] }); }}
        searchFn={(q) => searchFn({ data: { q } })}
        saveFn={(id, w, m) => upsertFn({ data: { customerId: id, isRecipient: true, asaasWalletId: w, mpCollectorId: m } })}
      />

      <EditRecipientDialog
        recipient={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["splits-recipients"] }); }}
        saveFn={(id, w, m) => upsertFn({ data: { customerId: id, isRecipient: true, asaasWalletId: w, mpCollectorId: m } })}
      />
    </div>
  );
}

function AddRecipientDialog(props: {
  open: boolean; onClose: () => void; onSaved: () => void;
  searchFn: (q: string) => Promise<any[]>;
  saveFn: (id: string, w: string | null, m: string | null) => Promise<any>;
}) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<any[]>([]);
  const [picked, setPicked] = React.useState<any | null>(null);
  const [wallet, setWallet] = React.useState("");
  const [collector, setCollector] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!props.open) { setQ(""); setResults([]); setPicked(null); setWallet(""); setCollector(""); }
  }, [props.open]);

  async function doSearch() {
    if (q.trim().length < 2) return;
    try { setResults(await props.searchFn(q.trim())); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function save() {
    if (!picked) return;
    setBusy(true);
    try {
      await props.saveFn(picked.id, wallet.trim() || null, collector.trim() || null);
      toast.success("Recebedor cadastrado");
      props.onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar recebedor</DialogTitle>
          <DialogDescription>Selecione um cliente e informe as credenciais no gateway.</DialogDescription>
        </DialogHeader>
        {!picked ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Nome, CPF ou telefone" value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()} />
              <Button onClick={doSearch}><Search className="mr-1.5 h-4 w-4" />Buscar</Button>
            </div>
            <ul className="max-h-60 divide-y divide-border rounded border">
              {results.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">CPF {c.cpf} · {c.phone ?? "—"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPicked(c)}>Selecionar</Button>
                </li>
              ))}
              {results.length === 0 && <li className="p-3 text-xs text-muted-foreground">Nenhum resultado.</li>}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{picked.name}</p>
              <p className="text-xs text-muted-foreground">CPF {picked.cpf}</p>
            </div>
            <div>
              <Label>Asaas walletId</Label>
              <Input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="ex: 22e49670-…" className="font-mono text-xs" />
            </div>
            <div>
              <Label>Mercado Pago collector_id</Label>
              <Input value={collector} onChange={(e) => setCollector(e.target.value)} placeholder="opcional (requer marketplace OAuth)" className="font-mono text-xs" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>Cancelar</Button>
          <Button disabled={!picked || busy} onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRecipientDialog(props: {
  recipient: Recipient | null; onClose: () => void; onSaved: () => void;
  saveFn: (id: string, w: string | null, m: string | null) => Promise<any>;
}) {
  const [wallet, setWallet] = React.useState("");
  const [collector, setCollector] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setWallet(props.recipient?.asaas_wallet_id ?? "");
    setCollector(props.recipient?.mp_collector_id ?? "");
  }, [props.recipient]);

  async function save() {
    if (!props.recipient) return;
    setBusy(true);
    try {
      await props.saveFn(props.recipient.id, wallet.trim() || null, collector.trim() || null);
      toast.success("Recebedor atualizado");
      props.onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!props.recipient} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar recebedor</DialogTitle>
          <DialogDescription>{props.recipient?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Asaas walletId</Label>
            <Input value={wallet} onChange={(e) => setWallet(e.target.value)} className="font-mono text-xs" />
          </div>
          <div>
            <Label>Mercado Pago collector_id</Label>
            <Input value={collector} onChange={(e) => setCollector(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
