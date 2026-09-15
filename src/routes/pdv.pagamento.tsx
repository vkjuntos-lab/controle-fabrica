import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import {
  usePdv,
  selectTotals,
  brl,
  paymentLabels,
  paymentIcons,
  type PaymentMethod,
  type Sale,
} from "@/lib/pdv-store";
import { ReceiptPreview } from "@/components/receipt-preview";
import { useReceiptSettings } from "@/lib/pdv-settings";
import {
  sendReceiptViaWhatsApp,
  normalizePhoneForWhatsApp,
} from "@/lib/pdv-whatsapp";
import { usePdvAuth } from "@/lib/pdv-auth";
import {
  createPixCharge,
  getPixChargeStatus,
  cancelPixCharge,
} from "@/lib/pdv-pix.functions";
import {
  lookupGiftCard,
  redeemGiftCard,
} from "@/lib/pdv-gift-cards.functions";
import {
  getStoreCreditBalance,
  debitStoreCredit,
} from "@/lib/pdv-store-credit.functions";
import { emitNFCeFromCart } from "@/lib/pdv-fiscal.functions";
import { FileText, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/pdv/pagamento")({
  component: PdvPagamento,
});

const methodOptions: PaymentMethod[] = [
  "cash", "pix", "credit", "debit",
  "gift_card", "store_credit",
  "credit_sale", "boleto", "payment_link",
];

type ActiveCharge = {
  id: string;
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string;
  paymentRef: string;
};

function PdvPagamento() {
  const { state, dispatch } = usePdv();
  const { user } = usePdvAuth();
  const navigate = useNavigate();
  const { settings } = useReceiptSettings();
  const totals = selectTotals(state);
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [amount, setAmount] = React.useState<string>("");
  const [previewSale, setPreviewSale] = React.useState<Sale | null>(null);
  const [waStatus, setWaStatus] = React.useState<string | null>(null);
  const [pixError, setPixError] = React.useState<string | null>(null);
  const [activeCharge, setActiveCharge] = React.useState<ActiveCharge | null>(null);
  const [saleCode] = React.useState<string>(
    () => "V" + Date.now().toString().slice(-8),
  );
  const [giftCode, setGiftCode] = React.useState("");
  const [giftBalance, setGiftBalance] = React.useState<number | null>(null);
  const [giftError, setGiftError] = React.useState<string | null>(null);
  const [scError, setScError] = React.useState<string | null>(null);

  const createPix = useServerFn(createPixCharge);
  const checkPix = useServerFn(getPixChargeStatus);
  const cancelPix = useServerFn(cancelPixCharge);
  const gcLookup = useServerFn(lookupGiftCard);
  const gcRedeem = useServerFn(redeemGiftCard);
  const scBalance = useServerFn(getStoreCreditBalance);
  const scDebit = useServerFn(debitStoreCredit);
  const emitNFCe = useServerFn(emitNFCeFromCart);

  const [nfceResult, setNfceResult] = React.useState<
    | { status: string; doc_id?: string; chave?: string | null; qrcode_url?: string | null; danfe_url?: string | null; error?: string | null; numero?: number; serie?: number }
    | null
  >(null);
  const nfceMut = useMutation({
    mutationFn: async () => {
      if (!user?.storeId) throw new Error("Operador sem loja vinculada.");
      const items = state.cart.lines.map((l) => ({
        sku: l.sku ?? null,
        product_id: null,
        name: l.name,
        qty: l.qty,
        unit_price: l.unit,
      }));
      const payments = state.cart.payments.length
        ? state.cart.payments.map((p) => ({ method: p.method, amount: p.amount }))
        : [{ method: "dinheiro", amount: totals.total }];
      return emitNFCe({
        data: {
          store_id: user.storeId,
          reference: `sale-${saleCode}`,
          total: Number(totals.total.toFixed(2)),
          customer: state.customer
            ? { id: state.customer.id ?? null, name: state.customer.name ?? null, cpf: (state.customer as any).cpf ?? null, cnpj: (state.customer as any).cnpj ?? null }
            : null,
          items,
          payments,
        },
      });
    },
    onSuccess: (r) => setNfceResult(r as any),
    onError: (e: any) => setNfceResult({ status: "rejected", error: e?.message ?? "Falha ao emitir" }),
  });

  const sessionActive = !!state.session && !state.session.closedAt;

  const createPixMut = useMutation({
    mutationFn: async (value: number) => {
      if (!user?.storeId) throw new Error("Operador sem loja vinculada.");
      if (!state.session?.id) throw new Error("Caixa fechado.");
      if (!state.customer?.id) {
        throw new Error("Identifique o cliente (com telefone) antes de gerar PIX.");
      }
      if (!state.customer.phone || state.customer.phone.replace(/\D/g, "").length < 10) {
        throw new Error("Cliente sem telefone válido — cadastre para gerar PIX.");
      }
      const result = await createPix({
        data: {
          storeId: user.storeId,
          sessionId: state.session.id,
          customerId: state.customer.id,
          saleCode,
          amount: Number(value.toFixed(2)),
          customerPhone: state.customer.phone,
          customerName: state.customer.name,
          cartSnapshot: {
            lines: state.cart.lines,
            cashbackUsed: state.cart.cashbackUsed,
          },
        },
      });
      return { result, value };
    },
    onSuccess: ({ result, value }) => {
      setPixError(null);
      const ref = result.id.slice(0, 8);
      dispatch({
        type: "ADD_PAYMENT",
        payment: {
          method: "pix",
          amount: value,
          status: "pending",
          ref,
        },
      });
      setActiveCharge({
        id: result.id,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        ticketUrl: result.ticketUrl,
        expiresAt: result.expiresAt,
        paymentRef: ref,
      });
      setAmount("");
    },
    onError: (err: any) => setPixError(err?.message ?? "Falha ao gerar PIX."),
  });

  // Polling do status enquanto houver charge ativa
  useQuery({
    queryKey: ["pix-status", activeCharge?.id],
    enabled: !!activeCharge?.id,
    refetchInterval: 4000,
    queryFn: async () => {
      if (!activeCharge) return null;
      const res = await checkPix({ data: { id: activeCharge.id } });
      const target = state.cart.payments.find((p) => p.ref === activeCharge.paymentRef);
      if (res.status === "approved") {
        if (target) dispatch({ type: "MARK_PAYMENT_PAID", id: target.id });
        setActiveCharge(null);
      } else if (res.status === "cancelled" || res.status === "expired") {
        if (target) dispatch({ type: "REMOVE_PAYMENT", id: target.id });
        setActiveCharge(null);
        setPixError("PIX cancelado/expirado. Gere uma nova cobrança.");
      }
      return res;
    },
  });

  // Store credit balance auto-fetch quando cliente + método
  const storeCreditQuery = useQuery({
    queryKey: ["store-credit-balance", state.customer?.id, user?.storeId],
    enabled: method === "store_credit" && !!state.customer?.id && !!user?.storeId,
    queryFn: () =>
      scBalance({ data: { customerId: state.customer!.id!, storeId: user!.storeId! } }),
    staleTime: 15000,
  });

  const gcLookupMut = useMutation({
    mutationFn: async () => {
      const gc = await gcLookup({ data: { code: giftCode.trim().toUpperCase() } });
      if (!gc) throw new Error("Vale-presente não encontrado");
      if (gc.status !== "active") throw new Error(`Vale ${gc.status}`);
      if (gc.expires_at && new Date(gc.expires_at) < new Date()) throw new Error("Vale expirado");
      return gc;
    },
    onSuccess: (gc) => { setGiftBalance(Number(gc.balance)); setGiftError(null); },
    onError: (e: any) => { setGiftBalance(null); setGiftError(e?.message ?? "Falha"); },
  });

  const gcRedeemMut = useMutation({
    mutationFn: async (value: number) => {
      const gc = await gcRedeem({
        data: { code: giftCode.trim().toUpperCase(), amount: value },
      });
      return { gc, value };
    },
    onSuccess: ({ gc, value }) => {
      dispatch({
        type: "ADD_PAYMENT",
        payment: {
          method: "gift_card",
          amount: value,
          status: "paid",
          ref: gc.code,
          meta: { giftCardCode: gc.code, giftCardId: gc.id },
        },
      });
      setGiftCode(""); setGiftBalance(null); setAmount(""); setGiftError(null);
    },
    onError: (e: any) => setGiftError(e?.message ?? "Falha ao resgatar"),
  });

  const scDebitMut = useMutation({
    mutationFn: async (value: number) => {
      if (!state.customer?.id || !user?.storeId) throw new Error("Cliente sem loja");
      const bal = await scDebit({
        data: {
          customerId: state.customer.id,
          storeId: user.storeId,
          amount: value,
          note: `Venda ${saleCode}`,
        },
      });
      return { value, bal };
    },
    onSuccess: ({ value }) => {
      dispatch({
        type: "ADD_PAYMENT",
        payment: { method: "store_credit", amount: value, status: "paid", ref: "saldo cliente" },
      });
      setAmount(""); setScError(null);
      storeCreditQuery.refetch();
    },
    onError: (e: any) => setScError(e?.message ?? "Falha"),
  });

  // Guardas (após todos os hooks!)
  if (state.session && state.session.closedAt) {
    return <Navigate to="/pdv/fechamento" replace />;
  }
  if (state.cart.lines.length === 0 && state.cart.payments.length === 0) {
    return <Navigate to="/pdv/venda" replace />;
  }

  const isExternalMethod = (m: PaymentMethod) =>
    m === "credit_sale" || m === "boleto" || m === "payment_link";

  const externalHref = (m: PaymentMethod): string => {
    if (m === "credit_sale") return "/pdv/crediario";
    if (m === "boleto") return "/pdv/recebimentos/boletos";
    return "/pdv/recebimentos";
  };

  const addPayment = () => {
    const value = Number(amount) || totals.remaining;
    if (value <= 0) return;

    if (method === "pix") {
      if (activeCharge) {
        setPixError("Já existe um PIX pendente — aguarde ou cancele antes.");
        return;
      }
      createPixMut.mutate(value);
      return;
    }
    if (method === "gift_card") {
      if (!giftCode.trim() || giftBalance == null) {
        setGiftError("Valide o código do vale antes.");
        return;
      }
      if (value > giftBalance) {
        setGiftError(`Saldo insuficiente (disponível ${brl(giftBalance)})`);
        return;
      }
      gcRedeemMut.mutate(value);
      return;
    }
    if (method === "store_credit") {
      if (!state.customer?.id) { setScError("Identifique o cliente primeiro."); return; }
      const bal = storeCreditQuery.data ?? 0;
      if (value > bal) { setScError(`Saldo insuficiente (disponível ${brl(bal)})`); return; }
      scDebitMut.mutate(value);
      return;
    }
    // credit/debit/cash → registro manual (paid)
    dispatch({
      type: "ADD_PAYMENT",
      payment: { method, amount: value, status: "paid" },
    });
    setAmount("");
  };

  const cancelActivePix = async () => {
    if (!activeCharge) return;
    try {
      await cancelPix({ data: { id: activeCharge.id } });
    } catch { /* segue */ }
    const target = state.cart.payments.find((p) => p.ref === activeCharge.paymentRef);
    if (target) dispatch({ type: "REMOVE_PAYMENT", id: target.id });
    setActiveCharge(null);
  };


  const finalize = async () => {
    const sale: Sale = {
      id: saleCode,
      createdAt: new Date().toISOString(),
      lines: state.cart.lines,
      payments: state.cart.payments,
      cashbackUsed: state.cart.cashbackUsed,
      total: totals.total,
      customer: state.customer ?? undefined,
    };
    dispatch({ type: "FINALIZE_SALE" });
    setPreviewSale(sale);
    setWaStatus(null);
    const phone = normalizePhoneForWhatsApp(sale.customer?.phone);
    if (phone) {
      const res = await sendReceiptViaWhatsApp(sale, settings);
      setWaStatus(
        res.ok
          ? `WhatsApp aberto para ${sale.customer?.name ?? "cliente"} · PDF baixado`
          : res.reason ?? "Não foi possível abrir o WhatsApp.",
      );
    } else {
      setWaStatus("Cliente sem WhatsApp cadastrado — envio automático ignorado.");
    }
  };

  const closePreview = () => {
    setPreviewSale(null);
    navigate({ to: "/pdv/fechamento" });
  };

  if (state.cart.lines.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma venda em andamento.</p>
        <Link
          to="/pdv/venda"
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
        >
          ← Voltar para venda
        </Link>
      </div>
    );
  }

  const paidEnough = totals.remaining < 0.005;
  const hasPending = totals.pending > 0.005;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Pagamento</h2>
            <p className="text-xs text-muted-foreground">
              {state.cart.lines.length} itens · {state.customer?.name ?? "consumidor"} ·
              Venda {saleCode}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              paidEnough
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            ● {paidEnough ? "Pronto para confirmar" : "Aguardando pagamento"}
          </span>
        </div>

        {/* Adicionar pagamento */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Forma de pagamento (split · multi-método)
          </div>

          {/* Grid de métodos */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {methodOptions.map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); setGiftError(null); setScError(null); }}
                className={`rounded-lg border px-3 py-2.5 text-left text-xs transition ${
                  method === m
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/40"
                }`}
              >
                <div className="text-lg">{paymentIcons[m]}</div>
                <div className="mt-1 font-medium leading-tight text-foreground">
                  {paymentLabels[m]}
                </div>
              </button>
            ))}
          </div>

          {/* Vale-presente input */}
          {method === "gift_card" && (
            <div className="mt-4 rounded-lg border border-dashed border-border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Vale-presente
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={giftCode}
                  onChange={(e) => { setGiftCode(e.target.value.toUpperCase()); setGiftBalance(null); }}
                  placeholder="KSABCD1234"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm tracking-widest"
                />
                <button
                  onClick={() => gcLookupMut.mutate()}
                  disabled={!giftCode || gcLookupMut.isPending}
                  className="rounded-md border border-border px-3 py-2 text-xs"
                >
                  {gcLookupMut.isPending ? "…" : "Validar"}
                </button>
              </div>
              {giftBalance != null && (
                <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                  ✓ Vale válido · saldo disponível <b>{brl(giftBalance)}</b>
                </div>
              )}
              {giftError && (
                <div className="mt-2 text-xs text-destructive">{giftError}</div>
              )}
            </div>
          )}

          {/* Store credit info */}
          {method === "store_credit" && (
            <div className="mt-4 rounded-lg border border-dashed border-border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Crédito da Loja · {state.customer?.name ?? "sem cliente"}
              </div>
              <div className="mt-1 text-sm">
                Saldo disponível:{" "}
                <b>
                  {state.customer?.id
                    ? storeCreditQuery.isLoading
                      ? "carregando…"
                      : brl(storeCreditQuery.data ?? 0)
                    : "identifique o cliente"}
                </b>
              </div>
              {scError && (
                <div className="mt-2 text-xs text-destructive">{scError}</div>
              )}
            </div>
          )}

          {/* External methods hint */}
          {isExternalMethod(method) && (
            <div className="mt-4 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <div className="font-medium text-amber-700 dark:text-amber-400">
                {paymentLabels[method]} · gerar em módulo dedicado
              </div>
              <p className="mt-1 text-muted-foreground">
                Abra a{" "}
                <Link to={externalHref(method) as any} target="_blank" className="font-medium text-primary underline">
                  Central de Recebimentos
                </Link>{" "}
                para gerar o {method === "credit_sale" ? "crediário" : method === "boleto" ? "boleto" : "link"}{" "}
                pelo valor abaixo e, ao voltar, adicione manualmente como pendente.
              </p>
            </div>
          )}

          {/* Amount + botão */}
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px]">
            <input
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Valor · restante ${brl(totals.remaining)}`}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => {
                if (isExternalMethod(method)) {
                  const value = Number(amount) || totals.remaining;
                  if (value <= 0) return;
                  dispatch({
                    type: "ADD_PAYMENT",
                    payment: { method, amount: value, status: "pending", ref: "aguardando externo" },
                  });
                  setAmount("");
                  return;
                }
                addPayment();
              }}
              disabled={
                !sessionActive ||
                totals.remaining <= 0 ||
                createPixMut.isPending ||
                (method === "pix" && !!activeCharge) ||
                (method === "gift_card" && (giftBalance == null || gcRedeemMut.isPending)) ||
                (method === "store_credit" && (!state.customer?.id || scDebitMut.isPending))
              }
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {method === "pix"
                ? createPixMut.isPending ? "Gerando QR…" : "Gerar QR PIX"
                : method === "gift_card"
                  ? gcRedeemMut.isPending ? "Resgatando…" : "Resgatar vale"
                  : method === "store_credit"
                    ? scDebitMut.isPending ? "Debitando…" : "Debitar saldo"
                    : isExternalMethod(method)
                      ? "Marcar como pendente"
                      : "Adicionar"}
            </button>
          </div>

          {method === "pix" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              PIX real via Mercado Pago · válido por 30 min · cliente precisa ter telefone cadastrado.
            </p>
          )}
          {pixError && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {pixError}
            </div>
          )}
        </div>

        {/* Métodos aplicados */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Formas de pagamento
          </div>
          <div className="divide-y divide-border">
            {totals.cashback > 0 && (
              <PayLine
                label={paymentLabels.cashback}
                ref_="carteira KS MultiMake"
                amount={totals.cashback}
                status="paid"
              />
            )}
            {state.cart.payments.length === 0 && totals.cashback === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum pagamento adicionado.
              </div>
            )}
            {state.cart.payments.map((p) => {
              const isActivePix = activeCharge?.paymentRef === p.ref;
              return (
                <div
                  key={p.id}
                  className={`grid grid-cols-[1fr_120px_120px_60px] items-center gap-3 px-4 py-3 ${
                    p.status === "pending" ? "bg-primary/5" : ""
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{paymentLabels[p.method]}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.ref ?? (p.status === "paid" ? "Autorizado" : "Aguardando")}
                      {isActivePix && " · polling MP"}
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums">{brl(p.amount)}</div>
                  <div className="text-right">
                    {p.status === "pending" ? (
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Aguardando
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        Pago
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (isActivePix) {
                        void cancelActivePix();
                      } else {
                        dispatch({ type: "REMOVE_PAYMENT", id: p.id });
                      }
                    }}
                    className="text-right text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* QR Code real */}
        {activeCharge && (
          <div className="grid gap-4 rounded-xl border border-border bg-card p-6 md:grid-cols-[220px_1fr]">
            <div className="flex items-center justify-center rounded-lg bg-white p-3">
              {activeCharge.qrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${activeCharge.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="h-52 w-52"
                />
              ) : (
                <div className="text-xs text-muted-foreground">QR indisponível</div>
              )}
            </div>
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                PIX · Mercado Pago
              </div>
              <div className="text-sm text-muted-foreground">
                Válido até{" "}
                <b className="text-foreground">
                  {new Date(activeCharge.expiresAt).toLocaleTimeString("pt-BR")}
                </b>
                . Confirmação automática via webhook — a tela atualiza sozinha.
              </div>
              <div className="rounded-lg border border-dashed border-border p-3 text-xs">
                <div className="mb-1 font-medium text-foreground">Copia e cola</div>
                <div className="font-mono text-[11px] leading-relaxed break-all text-foreground/80">
                  {activeCharge.qrCode}
                </div>
                <button
                  onClick={() => {
                    if (typeof navigator !== "undefined") {
                      void navigator.clipboard.writeText(activeCharge.qrCode);
                    }
                  }}
                  className="mt-2 rounded-md border border-border px-2 py-1 text-[11px]"
                >
                  Copiar
                </button>
              </div>
              {activeCharge.ticketUrl && (
                <a
                  href={activeCharge.ticketUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block text-xs text-primary underline"
                >
                  Abrir ticket no Mercado Pago
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SIDEBAR */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Totais</div>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Subtotal" value={brl(totals.subtotal)} />
            <Row label="Cashback" value={`- ${brl(totals.cashback)}`} tone="accent" />
            <Row label="Total do pedido" value={brl(totals.total)} />
            <Row label="Pago" value={brl(totals.paid)} tone="ok" />
            {totals.pending > 0 && <Row label="Aguardando" value={brl(totals.pending)} />}
            <div className="my-2 border-t border-border" />
            <Row label="Falta" value={brl(totals.remaining)} big />
          </dl>
          <button
            onClick={finalize}
            disabled={!paidEnough || !sessionActive}
            className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {hasPending ? "Confirmar venda (com pendentes) →" : "Confirmar venda e baixar estoque →"}
          </button>
          <Link
            to="/pdv/venda"
            className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-xs text-muted-foreground"
          >
            ← Voltar para venda
          </Link>
        </div>

        {/* NFC-e */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-primary" /> Nota Fiscal (NFC-e)
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Emite a NFC-e desta venda pelo provedor fiscal configurado da loja.
          </p>
          <button
            onClick={() => nfceMut.mutate()}
            disabled={!paidEnough || nfceMut.isPending || state.cart.lines.length === 0}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:border-primary/40 disabled:opacity-50"
          >
            <FileText className="h-4 w-4 text-primary" />
            {nfceMut.isPending ? "Emitindo NFC-e…" : "Emitir NFC-e"}
          </button>
          {nfceResult && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                nfceResult.status === "authorized"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : nfceResult.status === "rejected"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              <div className="flex items-center gap-1 font-medium">
                {nfceResult.status === "authorized" ? (
                  <><CheckCircle2 className="h-3.5 w-3.5" /> Autorizada</>
                ) : nfceResult.status === "rejected" ? (
                  <><AlertTriangle className="h-3.5 w-3.5" /> Rejeitada</>
                ) : (
                  <><AlertTriangle className="h-3.5 w-3.5" /> {nfceResult.status}</>
                )}
                {nfceResult.numero && nfceResult.serie != null && (
                  <span className="ml-1 text-[10px] opacity-80">· nº {nfceResult.numero}/{nfceResult.serie}</span>
                )}
              </div>
              {nfceResult.chave && (
                <div className="mt-1 break-all font-mono text-[10px] opacity-80">{nfceResult.chave}</div>
              )}
              {nfceResult.error && <div className="mt-1">{nfceResult.error}</div>}
              <div className="mt-2 flex gap-3">
                {nfceResult.qrcode_url && (
                  <a href={nfceResult.qrcode_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline">
                    <ExternalLink className="h-3 w-3" /> QR Code
                  </a>
                )}
                {nfceResult.danfe_url && (
                  <a href={nfceResult.danfe_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline">
                    <ExternalLink className="h-3 w-3" /> DANFE
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Ao confirmar
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>✓ Estoque baixado por lote (FEFO)</li>
            <li>✓ Venda registrada na sessão</li>
            <li>✓ Cashback creditado (2% do total)</li>
            <li>✓ Comprovante em PDF + WhatsApp</li>
          </ul>
        </div>
      </aside>

      <ReceiptPreview sale={previewSale} onClose={closePreview} notice={waStatus} />
    </div>
  );
}

function PayLine({
  label,
  ref_,
  amount,
  status,
}: {
  label: string;
  ref_: string;
  amount: number;
  status: "paid" | "pending";
}) {
  const tone =
    status === "pending"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  return (
    <div className="grid grid-cols-[1fr_120px_110px] items-center gap-3 px-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{ref_}</div>
      </div>
      <div className="text-right text-sm tabular-nums">{brl(amount)}</div>
      <div className="text-right">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>
          {status === "paid" ? "Pago" : "Pendente"}
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  big,
  tone,
}: {
  label: string;
  value: string;
  big?: boolean;
  tone?: "accent" | "ok";
}) {
  const color =
    tone === "accent"
      ? "text-primary"
      : tone === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className={`tabular-nums ${big ? "text-xl font-semibold" : ""} ${color}`}>{value}</dd>
    </div>
  );
}
