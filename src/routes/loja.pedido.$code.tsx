import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import {
  getStorefrontOrder,
  markStorefrontWhatsapp,
  updateStorefrontOrderNotes,
  cancelStorefrontOrder,
} from "@/lib/pdv-storefront.functions";
import { StorefrontHeader, StorefrontFooter } from "@/components/storefront/chrome";
import { formatBRL } from "@/lib/pdv-storefront-cart";

const orderQuery = (code: string) =>
  queryOptions({
    queryKey: ["storefront", "order", code],
    queryFn: () => getStorefrontOrder({ data: { code } }),
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/loja/pedido/$code")({
  loader: async ({ params, context }: any) => {
    const o = await context.queryClient.ensureQueryData(orderQuery(params.code));
    if (!o) throw notFound();
    return null;
  },
  head: ({ params }: any) => ({
    meta: [
      { title: `Pedido ${params.code} — KS MultiMake` },
      { name: "description", content: "Acompanhe o status do seu pedido reservado na vitrine KS MultiMake." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:url", content: `/loja/pedido/${params.code}` },
    ],
    links: [{ rel: "canonical", href: `/loja/pedido/${params.code}` }],
  }),
  component: OrderPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl p-8 text-center text-sm text-muted-foreground">
      Não foi possível abrir o pedido. {String(error?.message ?? "")}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl p-8 text-center">
      <p className="text-sm text-muted-foreground">Pedido não encontrado.</p>
      <Link to="/loja" className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
        ← Voltar à vitrine
      </Link>
    </div>
  ),
});

type StepKey = "created" | "whatsapp_sent" | "reserved" | "confirmed" | "cancelled";

function statusLabel(s: string): string {
  return ({
    pending: "Aguardando envio",
    whatsapp_sent: "Enviado por WhatsApp",
    reserved: "Estoque reservado",
    confirmed: "Confirmado pela loja",
    cancelled: "Cancelado",
    expired: "Expirado",
  } as Record<string, string>)[s] ?? s;
}

function OrderPage() {
  const { code } = Route.useParams();
  const { data: order } = useSuspenseQuery(orderQuery(code));
  const qc = useQueryClient();
  const markWa = useServerFn(markStorefrontWhatsapp);
  const updateNotes = useServerFn(updateStorefrontOrderNotes);
  const cancelFn = useServerFn(cancelStorefrontOrder);

  const [notesDraft, setNotesDraft] = React.useState(order?.notes ?? "");
  const [savingNotes, setSavingNotes] = React.useState(false);
  const [notesMsg, setNotesMsg] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  if (!order) return null;

  const editable = ["pending", "reserved", "whatsapp_sent"].includes(order.status);
  const cancellable = editable;

  const refresh = () => qc.invalidateQueries({ queryKey: ["storefront", "order", code] });

  const onConfirmWa = async () => {
    setConfirming(true);
    try { await markWa({ data: { code, confirmed: true } }); await refresh(); }
    finally { setConfirming(false); }
  };

  const onSaveNotes = async () => {
    setSavingNotes(true); setNotesMsg(null);
    try {
      const r = await updateNotes({ data: { code, notes: notesDraft } });
      setNotesMsg(r.ok ? "Observações atualizadas." : (("error" in r ? r.error : null) ?? "Não foi possível atualizar."));
      if (r.ok) await refresh();
    } finally {
      setSavingNotes(false);
      setTimeout(() => setNotesMsg(null), 2500);
    }
  };

  const onCancel = async () => {
    if (!confirm("Cancelar este pedido? A reserva de estoque será liberada.")) return;
    setCancelling(true);
    try { await cancelFn({ data: { code } }); await refresh(); }
    finally { setCancelling(false); }
  };

  const steps: { key: StepKey; label: string; done: boolean; current: boolean }[] = (() => {
    const s = order.status;
    const isWa = order.channel === "whatsapp";
    const arr: { key: StepKey; label: string; done: boolean; current: boolean }[] = [
      { key: "created", label: "Pedido criado", done: true, current: s === "pending" },
    ];
    if (isWa) {
      arr.push({
        key: "whatsapp_sent",
        label: "Mensagem enviada no WhatsApp",
        done: !!order.whatsapp_confirmed_at || ["whatsapp_sent","confirmed"].includes(s),
        current: s === "whatsapp_sent",
      });
    } else {
      arr.push({
        key: "reserved",
        label: "Estoque reservado",
        done: !!order.reserved_until || ["reserved","confirmed"].includes(s),
        current: s === "reserved",
      });
    }
    arr.push({
      key: "confirmed",
      label: "Confirmado / retirado na loja",
      done: s === "confirmed",
      current: s === "confirmed",
    });
    if (s === "cancelled") arr.push({ key: "cancelled", label: "Cancelado", done: true, current: true });
    return arr;
  })();

  const reservedMinsLeft = order.reserved_until
    ? Math.max(0, Math.floor((new Date(order.reserved_until).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StorefrontHeader />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <div className="text-3xl">🧾</div>
          <h1 className="mt-3 text-2xl font-bold">Pedido {order.code}</h1>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
            <span className={`inline-block h-2 w-2 rounded-full ${
              order.status === "confirmed" ? "bg-emerald-500" :
              order.status === "cancelled" ? "bg-destructive" :
              order.status === "reserved" ? "bg-blue-500" :
              "bg-amber-500"
            }`} />
            <span>{statusLabel(order.status)}</span>
          </div>
          <div className="mx-auto mt-4 inline-block rounded-lg bg-muted px-6 py-3 font-mono text-3xl font-bold tracking-widest">
            {order.code}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Canal: {order.channel === "pdv" ? "Retirada no PDV" : "WhatsApp"}
            {reservedMinsLeft !== null && order.status === "reserved" && (
              <> · Reserva válida por mais <b>{reservedMinsLeft} min</b></>
            )}
          </div>
        </div>

        {/* Etapas */}
        <ol className="mt-6 space-y-2">
          {steps.map((st, i) => (
            <li key={st.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
              st.current ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                st.done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
              }`}>{st.done ? "✓" : i + 1}</span>
              <span className={st.done ? "" : "text-muted-foreground"}>{st.label}</span>
            </li>
          ))}
        </ol>

        {/* Ação canal WhatsApp */}
        {order.channel === "whatsapp" && order.status === "pending" && (
          <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="text-sm font-medium">Você já enviou a mensagem pelo WhatsApp?</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Confirme aqui para marcarmos como <b>enviado</b> e a loja poder acompanhar.
            </p>
            <button
              type="button"
              disabled={confirming}
              onClick={onConfirmWa}
              className="mt-3 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              {confirming ? "Confirmando..." : "✅ Sim, enviei a mensagem"}
            </button>
          </div>
        )}

        {/* Itens */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold">Itens</div>
          <ul className="mt-3 divide-y divide-border text-sm">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{it.qty}× {it.name}</span>
                <span className="tabular-nums">{formatBRL(it.qty * it.unit_price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatBRL(Number(order.total))}</span>
          </div>
        </div>

        {/* Observações */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold">Observações</div>
          {editable ? (
            <>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Adicione detalhes: cor, tamanho, endereço de entrega, etc."
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onSaveNotes}
                  disabled={savingNotes || (notesDraft ?? "") === (order.notes ?? "")}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingNotes ? "Salvando..." : "Salvar observações"}
                </button>
                {notesMsg && <span className="text-xs text-muted-foreground">{notesMsg}</span>}
              </div>
            </>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {order.notes || "—"}
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link to="/loja" className="text-xs text-muted-foreground hover:text-foreground">
            ← Voltar à vitrine
          </Link>
          {cancellable && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              {cancelling ? "Cancelando..." : "Cancelar pedido"}
            </button>
          )}
        </div>
      </main>
      <StorefrontFooter />
    </div>
  );
}
