import * as React from "react";
import type { Sale } from "@/lib/pdv-store";
import { buildSaleReceipt } from "@/lib/pdv-receipt";
import { useReceiptSettings } from "@/lib/pdv-settings";
import { sendReceiptViaWhatsApp, normalizePhoneForWhatsApp } from "@/lib/pdv-whatsapp";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { emitNFCeFromCart } from "@/lib/pdv-fiscal.functions";
import { usePdvAuth } from "@/lib/pdv-auth";

type Props = {
  sale: Sale | null;
  onClose: () => void;
  notice?: string | null;
};

const NFCE_PAY_MAP: Record<string, string> = {
  cash: "dinheiro", pix: "pix", credit: "cartao_credito", debit: "cartao_debito",
  gift_card: "outros", store_credit: "outros", credit_sale: "outros",
  boleto: "outros", payment_link: "outros", cashback: "outros",
};

export function ReceiptPreview({ sale, onClose, notice }: Props) {
  const { settings } = useReceiptSettings();
  const { user } = usePdvAuth();
  const [url, setUrl] = React.useState<string | null>(null);
  const [waMsg, setWaMsg] = React.useState<string | null>(null);
  const [nfceMsg, setNfceMsg] = React.useState<string | null>(null);
  const docRef = React.useRef<Awaited<ReturnType<typeof buildSaleReceipt>> | null>(null);
  const emitFn = useServerFn(emitNFCeFromCart);

  const emitMut = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error("sem venda");
      return emitFn({ data: {
        store_id: user?.storeId ?? null,
        reference: `sale-${sale.id}-${Date.now()}`,
        total: sale.total,
        customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name } : null,
        items: sale.lines.map((l) => ({
          sku: l.sku, name: l.name, qty: l.qty, unit_price: l.unit,
        })),
        payments: sale.payments
          .filter((p) => p.status === "paid")
          .map((p) => ({ method: NFCE_PAY_MAP[p.method] ?? "outros", amount: p.amount })),
      } });
    },
    onSuccess: (r: any) => {
      if (r.status === "authorized") {
        setNfceMsg(`✓ NFC-e ${r.serie}/${r.numero} autorizada · chave ${r.chave?.slice(0, 12)}…`);
      } else if (r.status === "processing" || r.status === "contingency") {
        setNfceMsg(`⏳ NFC-e em ${r.status} — acompanhe em /pdv/fiscal/documentos`);
      } else {
        setNfceMsg(`✗ Rejeitada: ${r.error ?? "erro"}`);
      }
    },
    onError: (e: any) => setNfceMsg("✗ " + (e?.message ?? "falha ao emitir")),
  });


  React.useEffect(() => {
    if (!sale) {
      setUrl(null);
      setNfceMsg(null);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      const doc = await buildSaleReceipt(sale, settings);
      if (cancelled) return;
      docRef.current = doc;
      const blob = doc.output("blob");
      const blobUrl = URL.createObjectURL(blob);
      revoked = blobUrl;
      setUrl(blobUrl);
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [sale, settings]);

  if (!sale) return null;

  const filename = `comprovante-${sale.id}.pdf`;

  const download = () => docRef.current?.save(filename);
  const openInTab = () => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };
  const printIt = () => {
    if (!url) return;
    const iframe = document.getElementById(
      "receipt-preview-iframe",
    ) as HTMLIFrameElement | null;
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  };
  const sendWa = async () => {
    if (!sale) return;
    const res = await sendReceiptViaWhatsApp(sale, settings);
    setWaMsg(res.ok ? "WhatsApp aberto e PDF baixado." : res.reason ?? "Falhou.");
  };
  const hasPhone = !!normalizePhoneForWhatsApp(sale.customer?.phone);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Comprovante {sale.id}</div>
            <div className="text-[11px] text-muted-foreground">
              Pré-visualização do PDF · formato cupom 80mm
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 bg-muted/40">
          {url ? (
            <iframe
              id="receipt-preview-iframe"
              src={url}
              title={filename}
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Gerando PDF…
            </div>
          )}
        </div>

        {(notice || waMsg) && (
          <div className="border-t border-border bg-emerald-500/5 px-4 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
            {waMsg ?? notice}
          </div>
        )}
        {nfceMsg && (
          <div className={`border-t border-border px-4 py-2 text-[11px] ${
            nfceMsg.startsWith("✓") ? "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            : nfceMsg.startsWith("⏳") ? "bg-amber-500/5 text-amber-700 dark:text-amber-400"
            : "bg-destructive/5 text-destructive"
          }`}>
            {nfceMsg}
          </div>
        )}

        <div className="border-t border-border bg-card p-3 space-y-2">
          <button
            onClick={() => emitMut.mutate()}
            disabled={emitMut.isPending || !sale}
            className="w-full rounded-md bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {emitMut.isPending ? "Emitindo NFC-e…" : "🧾 Emitir NFC-e"}
          </button>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              onClick={sendWa}
              disabled={!sale || !hasPhone}
              title={hasPhone ? "Enviar via WhatsApp" : "Cliente sem WhatsApp cadastrado"}
              className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              📱 WhatsApp
            </button>
            <button
              onClick={openInTab}
              disabled={!url}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
            >
              ↗ Nova aba
            </button>
            <button
              onClick={printIt}
              disabled={!url}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
            >
              🖨 Imprimir
            </button>
            <button
              onClick={download}
              disabled={!url}
              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              ⬇ Baixar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
