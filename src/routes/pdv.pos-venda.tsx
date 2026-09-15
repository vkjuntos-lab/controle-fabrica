import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  listPostSaleOrders,
  markOrderShipped,
  reissueFiscalForOrder,
  openReturnRequest,
} from "@/lib/pdv-posvenda.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Truck, RefreshCw, FileText, PackageCheck, Undo2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pdv/pos-venda")({
  component: PosVendaPage,
  head: () => ({
    meta: [
      { title: "Pós-venda — Pedidos WhatsApp | KS MultiMake" },
      { name: "description", content: "Acompanhe pedidos WhatsApp: enviar, reemitir NF, abrir devoluções." },
    ],
  }),
});

const brl = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  link_created: { label: "Link criado", cls: "bg-slate-100 text-slate-800" },
  link_sent: { label: "Link enviado", cls: "bg-blue-100 text-blue-800" },
  paid: { label: "Pago", cls: "bg-emerald-100 text-emerald-800" },
  stock_baixa: { label: "Baixado", cls: "bg-teal-100 text-teal-800" },
  shipped: { label: "Enviado", cls: "bg-indigo-100 text-indigo-800" },
  return_requested: { label: "Devolução", cls: "bg-amber-100 text-amber-800" },
};

function PosVendaPage() {
  const { currentStoreId: storeId } = useCurrentStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending_shipment" | "shipped" | "returns" | "unpaid">("pending_shipment");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["posvenda", storeId, filter, search],
    enabled: !!storeId,
    queryFn: () => listPostSaleOrders({ data: { store_id: storeId!, filter, search: search || undefined } }),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["posvenda"] });

  const orders = q.data?.orders ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Pós-venda</h1>
          <Badge variant="secondary">Onda 3</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={filter} onValueChange={(v: any) => setFilter(v)}>
              <TabsList>
                <TabsTrigger value="pending_shipment">A enviar</TabsTrigger>
                <TabsTrigger value="shipped">Enviados</TabsTrigger>
                <TabsTrigger value="returns">Devoluções</TabsTrigger>
                <TabsTrigger value="unpaid">Não pagos</TabsTrigger>
                <TabsTrigger value="all">Todos</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código do pedido…"
                className="pl-8 w-56"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rastreio</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o: any) => {
                const st = STATUS_LABEL[o.derived_status] ?? STATUS_LABEL.link_created;
                const mode = o.fulfillment?.mode;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.code}</TableCell>
                    <TableCell>{brl(Number(o.paid_amount ?? o.amount))}</TableCell>
                    <TableCell className="text-xs">
                      {mode === "pickup" ? "🏪 Retirada" : mode === "delivery" ? "🚚 Entrega" : "—"}
                      {o.fulfillment?.city ? <div className="text-muted-foreground">{o.fulfillment.city}</div> : null}
                    </TableCell>
                    <TableCell>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.tracking_code ? (
                        <div>
                          <div className="font-mono">{o.tracking_code}</div>
                          {o.carrier && <div className="text-muted-foreground">{o.carrier}</div>}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{fmt(o.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {o.status === "paid" && !o.shipped_at && (
                          <ShipDialog order={o} onDone={invalidate} />
                        )}
                        {o.sale_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Reemitir NF"
                            onClick={async () => {
                              const r = await reissueFiscalForOrder({ data: { link_id: o.id } });
                              (r as any)?.ok ? toast.success("Reemissão solicitada") : toast.error((r as any)?.error ?? "Falhou");
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {!o.return_requested_at && (
                          <ReturnDialog order={o} onDone={invalidate} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!orders.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    Nenhum pedido nesta visão.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ShipDialog({ order, onDone }: { order: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const m = useMutation({
    mutationFn: () => markOrderShipped({ data: { link_id: order.id, tracking_code: tracking || undefined, carrier: carrier || undefined } }),
    onSuccess: (r: any) => {
      if (r?.ok) {
        toast.success(r.notified ? "Enviado — cliente notificada" : "Marcado como enviado");
        setOpen(false); setTracking(""); setCarrier(""); onDone();
      } else toast.error(r?.error ?? "Falhou");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Marcar como enviado"><Truck className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar pedido {order.code} como enviado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Código de rastreio (opcional)</Label>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ex.: AB123456789BR" />
          </div>
          <div>
            <Label>Transportadora (opcional)</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Correios, Loggi…" />
          </div>
          <p className="text-xs text-muted-foreground">
            {order.fulfillment?.mode === "pickup"
              ? "Retirada no balcão — cliente será avisada que já pode retirar."
              : "Uma mensagem no WhatsApp com o código de rastreio será enviada para a cliente."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? "Enviando…" : "Confirmar envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ order, onDone }: { order: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => openReturnRequest({ data: { link_id: order.id, reason } }),
    onSuccess: (r: any) => {
      if (r?.ok) {
        toast.success("Devolução registrada · handoff para humano");
        setOpen(false); setReason(""); onDone();
      } else toast.error(r?.error ?? "Falhou");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Abrir devolução/troca"><Undo2 className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Abrir devolução — {order.code}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo</Label>
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente recebeu tom errado; produto danificado no transporte…"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A conversa será transferida para atendimento humano automaticamente.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || reason.trim().length < 3}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
