import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import {
  listStorefrontAdminOrders,
  confirmStorefrontOrder,
  cancelStorefrontAdminOrder,
  setStorefrontWaMessageId,
  sendStorefrontWhatsappViaCloud,
  type StorefrontAdminOrder,
} from "@/lib/pdv-storefront-admin.functions";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, RefreshCw, Store as StoreIcon, MessageSquare, Send,
  Clock, PackageCheck, MessageCircle, CheckCheck, AlertTriangle, Ban,
} from "lucide-react";

export const Route = createFileRoute("/pdv/vitrine")({
  component: VitrineAdminPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm text-destructive">
      Erro ao carregar pedidos: {error?.message}
      <Button variant="link" onClick={() => reset()}>tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Não encontrado.</div>,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando",
  reserved: "Reservado",
  whatsapp_sent: "WhatsApp enviado",
  whatsapp_delivered: "WhatsApp entregue",
  whatsapp_failed: "WhatsApp falhou",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
};

const STATUS_TONE: Record<string, string> = {
  pending: "secondary",
  reserved: "default",
  whatsapp_sent: "default",
  whatsapp_delivered: "default",
  whatsapp_failed: "destructive",
  confirmed: "default",
  cancelled: "outline",
};

/** Ícone + cor por status (usa Tailwind text-* para respeitar tema claro/escuro). */
const STATUS_ICON: Record<string, { Icon: React.ComponentType<{ className?: string }>; className: string }> = {
  pending:            { Icon: Clock,         className: "text-amber-500" },
  reserved:           { Icon: PackageCheck,  className: "text-sky-500" },
  whatsapp_sent:      { Icon: MessageCircle, className: "text-[#25D366]" },
  whatsapp_delivered: { Icon: CheckCheck,    className: "text-[#25D366]" },
  whatsapp_failed:    { Icon: AlertTriangle, className: "text-destructive" },
  confirmed:          { Icon: CheckCircle2,  className: "text-emerald-600" },
  cancelled:          { Icon: Ban,           className: "text-muted-foreground" },
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function VitrineAdminPage() {
  const router = useRouter();
  const { currentStoreId } = useCurrentStore();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [scope, setScope] = React.useState<"store" | "all">("store");

  const listFn = useServerFn(listStorefrontAdminOrders);
  const q = useQuery({
    queryKey: ["storefront-admin-orders", scope, currentStoreId, statusFilter],
    queryFn: () => listFn({
      data: {
        store_id: scope === "store" ? currentStoreId ?? null : null,
        status: statusFilter === "all" ? null : statusFilter,
        limit: 200,
      },
    }),
  });

  const refresh = React.useCallback(() => {
    q.refetch();
    router.invalidate();
  }, [q, router]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vitrine — Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Confirme ou cancele reservas feitas pelo cliente na loja online.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={q.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 text-primary ${q.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-40">
            <Label>Loja</Label>
            <Select value={scope} onValueChange={(v: "store" | "all") => setScope(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="store">Apenas loja atual</SelectItem>
                <SelectItem value="all">Todas as lojas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-48">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando pedidos…</div>
      ) : (q.data ?? []).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum pedido encontrado para os filtros atuais.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((o) => (
            <OrderRow key={o.code} order={o} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, onChanged }: { order: StorefrontAdminOrder; onChanged: () => void }) {
  const confirmFn = useServerFn(confirmStorefrontOrder);
  const cancelFn = useServerFn(cancelStorefrontAdminOrder);
  const setMsgFn = useServerFn(setStorefrontWaMessageId);
  const sendFn = useServerFn(sendStorefrontWhatsappViaCloud);
  const [busy, setBusy] = React.useState<null | "confirm" | "cancel" | "link" | "send">(null);
  const [msgId, setMsgId] = React.useState("");
  const [showLink, setShowLink] = React.useState(false);

  const canAct = !["confirmed", "cancelled"].includes(order.status);
  const reservedIn = order.reserved_until ? new Date(order.reserved_until).getTime() - Date.now() : 0;
  const reservedMin = Math.max(0, Math.round(reservedIn / 60000));
  const canAutoSend =
    order.channel === "whatsapp" && !order.wa_message_id && !!order.customer_phone;

  async function doConfirm() {
    setBusy("confirm");
    const r = await confirmFn({ data: { code: order.code } });
    setBusy(null);
    if (r.ok) { toast.success(`Pedido ${order.code} confirmado`); onChanged(); }
    else toast.error(r.error ?? "Falha ao confirmar");
  }
  async function doCancel() {
    if (!confirm(`Cancelar pedido ${order.code}? Isso libera a reserva de estoque.`)) return;
    setBusy("cancel");
    const r = await cancelFn({ data: { code: order.code } });
    setBusy(null);
    if (r.ok) { toast.success(`Pedido ${order.code} cancelado`); onChanged(); }
    else toast.error(r.error ?? "Falha ao cancelar");
  }
  async function doLink() {
    if (!msgId.trim()) return;
    setBusy("link");
    const r = await setMsgFn({ data: { code: order.code, message_id: msgId.trim() } });
    setBusy(null);
    if (r.ok) { toast.success("ID vinculado — status virá pelo webhook."); setMsgId(""); setShowLink(false); onChanged(); }
    else toast.error(r.error ?? "Falha ao vincular");
  }
  async function doSend() {
    setBusy("send");
    const r = await sendFn({ data: { code: order.code } });
    setBusy(null);
    if (r.ok) {
      toast.success(`Mensagem enviada — id vinculado automaticamente.`);
      onChanged();
    } else {
      toast.error(r.error ?? "Falha ao enviar");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base font-mono">#{order.code}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {(() => {
              const s = STATUS_ICON[order.status];
              const Icon = s?.Icon ?? Clock;
              return (
                <Badge variant={(STATUS_TONE[order.status] as any) ?? "outline"} className="gap-1">
                  <Icon className={`h-3.5 w-3.5 ${s?.className ?? ""}`} />
                  {STATUS_LABEL[order.status] ?? order.status}
                </Badge>
              );
            })()}
            <span className="inline-flex items-center gap-1">
              {order.channel === "whatsapp"
                ? <><MessageCircle className="h-3 w-3 text-[#25D366]" />Canal: WhatsApp</>
                : <>Canal: PDV</>}
            </span>
            {order.store_name && <span className="inline-flex items-center gap-1"><StoreIcon className="h-3 w-3 text-primary" />{order.store_name}</span>}
            <span>· {fmtDate(order.created_at)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold">{brl(order.total)}</div>
          {order.reserved_until && !["confirmed","cancelled"].includes(order.status) && (
            <div className="text-xs text-muted-foreground">Reserva: {reservedMin}min</div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="text-sm">
          <div className="text-muted-foreground">Cliente</div>
          <div>{order.customer_name || "—"} {order.customer_phone ? `· ${order.customer_phone}` : ""}</div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">Itens</div>
          <ul className="mt-1 space-y-0.5">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between">
                <span>{it.qty}× {it.name} <span className="text-xs text-muted-foreground">({it.sku})</span></span>
                <span>{brl(it.qty * it.unit_price)}</span>
              </li>
            ))}
          </ul>
        </div>

        {(order.wa_status || order.wa_message_id) && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <div className="font-medium">Rastreio WhatsApp</div>
            <div className="text-muted-foreground">
              Status: <b>{order.wa_status ?? "—"}</b>
              {order.wa_message_id && <> · id: <code className="text-[10px]">{order.wa_message_id.slice(0, 24)}…</code></>}
            </div>
          </div>
        )}

        {order.notes && (
          <div className="text-xs text-muted-foreground whitespace-pre-line border-l-2 pl-2">
            {order.notes}
          </div>
        )}

        {canAct && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={doConfirm} disabled={!!busy}>
              <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-400" /> Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={doCancel} disabled={!!busy}>
              <XCircle className="mr-1 h-4 w-4 text-destructive" /> Cancelar
            </Button>
            {canAutoSend && (
              <Button size="sm" variant="secondary" onClick={doSend} disabled={!!busy}>
                <Send className="mr-1 h-4 w-4 text-[#25D366]" />
                {busy === "send" ? "Enviando…" : "Enviar WhatsApp (auto)"}
              </Button>
            )}
            {!order.wa_message_id && order.channel === "whatsapp" && (
              <Button size="sm" variant="ghost" onClick={() => setShowLink((v) => !v)}>
                <MessageSquare className="mr-1 h-4 w-4 text-[#25D366]" /> Vincular msg manualmente
              </Button>
            )}
          </div>
        )}

        {canAct && order.channel === "whatsapp" && !order.customer_phone && !order.wa_message_id && (
          <div className="text-xs text-muted-foreground">
            Cliente sem telefone — o envio automático precisa do WhatsApp do cliente.
          </div>
        )}

        {showLink && (
          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1">
              <Label className="text-xs">Message ID (retornado pelo WhatsApp Business API)</Label>
              <Input value={msgId} onChange={(e) => setMsgId(e.target.value)} placeholder="wamid.HBg..." />
            </div>
            <Button size="sm" onClick={doLink} disabled={!!busy || !msgId.trim()}>Vincular</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
