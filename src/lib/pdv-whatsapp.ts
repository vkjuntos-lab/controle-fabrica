import type { Sale } from "@/lib/pdv-store";
import { brl, paymentLabels } from "@/lib/pdv-store";
import { downloadSaleReceipt } from "@/lib/pdv-receipt";
import type { ReceiptSettings } from "@/lib/pdv-settings";

/**
 * Normaliza um telefone para o formato E.164 sem "+" (aceito pelo wa.me).
 * Se o número tiver 10 ou 11 dígitos (formato BR sem DDI), prefixa 55.
 * Retorna null quando o número for inválido.
 */
export function normalizePhoneForWhatsApp(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

export function buildWhatsAppMessage(sale: Sale, storeName?: string): string {
  const lines: string[] = [];
  const who = sale.customer?.name ? `Olá, ${sale.customer.name.split(" ")[0]}!` : "Olá!";
  lines.push(who);
  lines.push(
    `Obrigado pela compra${storeName ? ` na ${storeName}` : ""}. Segue o resumo do pedido *${sale.id}*:`,
  );
  lines.push("");
  for (const l of sale.lines) {
    lines.push(`• ${l.qty}x ${l.name} — ${brl(l.qty * l.unit)}`);
  }
  lines.push("");
  if (sale.cashbackUsed > 0) lines.push(`Cashback usado: -${brl(sale.cashbackUsed)}`);
  lines.push(`*Total: ${brl(sale.total)}*`);
  const paid = sale.payments.map((p) => `${paymentLabels[p.method]} ${brl(p.amount)}`).join(" · ");
  if (paid) lines.push(`Pagamento: ${paid}`);
  lines.push("");
  lines.push("📎 O comprovante em PDF foi baixado no caixa — anexe aqui nesta conversa para o cliente. 💜");
  return lines.join("\n");
}

/**
 * Fluxo click-to-chat: baixa o PDF localmente e abre o WhatsApp
 * (wa.me) no telefone do cliente com uma mensagem pronta.
 * O wa.me não suporta anexo direto — o atendente anexa o PDF baixado
 * na janela do WhatsApp que abre. Retorna `false` se o telefone não
 * for válido.
 */
export async function sendReceiptViaWhatsApp(
  sale: Sale,
  settings?: ReceiptSettings,
): Promise<{ ok: boolean; reason?: string; url?: string }> {
  const phone = normalizePhoneForWhatsApp(sale.customer?.phone);
  if (!phone) return { ok: false, reason: "Telefone do cliente não cadastrado." };
  // 1) baixa o PDF para o atendente anexar
  try {
    await downloadSaleReceipt(sale, settings);
  } catch (err) {
    console.error("Erro ao gerar PDF do comprovante:", err);
  }
  // 2) abre wa.me com mensagem pronta
  const text = buildWhatsAppMessage(sale, settings?.companyName);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return { ok: true, url };
}
