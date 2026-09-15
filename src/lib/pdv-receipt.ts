import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { brl, paymentLabels, type Sale } from "./pdv-store";
import { defaultSettings, type ReceiptSettings } from "./pdv-settings";

const PIX_PAYLOAD =
  "00020126580014BR.GOV.BCB.PIX0136ksmultimake@mercadopago.com.br5204000053039865802BR5924KS MULTIMAKE VILA MADAL6009SAO PAULO62070503***6304ABCD";

export async function buildSaleReceipt(
  sale: Sale,
  settings: ReceiptSettings = defaultSettings,
) {
  const W = settings.widthMm;
  const font = settings.font;
  const doc = new jsPDF({ unit: "mm", format: [W, 297] });
  const margin = W === 58 ? 3 : 5;
  let y = margin + 3;

  const line = (
    text: string,
    opts: {
      bold?: boolean;
      size?: number;
      align?: "left" | "center" | "right";
    } = {},
  ) => {
    doc.setFont(font, opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 9);
    const x =
      opts.align === "center"
        ? W / 2
        : opts.align === "right"
          ? W - margin
          : margin;
    doc.text(text, x, y, { align: opts.align ?? "left" });
    y += (opts.size ?? 9) * 0.42 + 1.2;
  };

  const hr = () => {
    doc.setLineDashPattern([0.5, 0.5], 0);
    doc.setDrawColor(120);
    doc.line(margin, y, W - margin, y);
    y += 2.5;
  };

  // Logo (opcional)
  if (settings.logoDataUrl) {
    try {
      const maxW = W - margin * 2;
      const imgW = Math.min(maxW, 40);
      const imgH = 15;
      doc.addImage(settings.logoDataUrl, "PNG", (W - imgW) / 2, y, imgW, imgH);
      y += imgH + 2;
    } catch {
      /* ignore invalid image */
    }
  }

  // Cabeçalho
  line(settings.companyName, { bold: true, size: W === 58 ? 11 : 13, align: "center" });
  if (settings.addressLine1)
    line(settings.addressLine1, { size: 8, align: "center" });
  if (settings.addressLine2)
    line(settings.addressLine2, { size: 7.5, align: "center" });
  if (settings.cnpj) line(settings.cnpj, { size: 7.5, align: "center" });
  hr();

  const dt = new Date(sale.createdAt);
  line(`Comprovante ${sale.id}`, { bold: true, size: 10 });
  line(`${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR")}`, { size: 8 });
  if (sale.customer) {
    line(`Cliente: ${sale.customer.name} (${sale.customer.tier})`, { size: 8 });
    line(`CPF: ${sale.customer.cpfMasked}`, { size: 8 });
  }
  hr();

  // Itens por lote/validade
  line("Itens", { bold: true, size: 9 });
  for (const l of sale.lines) {
    doc.setFont(font, "normal");
    doc.setFontSize(8.5);
    const name = doc.splitTextToSize(l.name, W - margin * 2);
    doc.text(name, margin, y);
    y += name.length * 3.5;
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(`SKU ${l.sku} · lote ${l.lotId} · val. ${l.validity}`, margin, y);
    y += 3;
    doc.setTextColor(0);
    doc.setFontSize(8.5);
    doc.text(`${l.qty} × ${brl(l.unit)}`, margin, y);
    doc.text(brl(l.qty * l.unit), W - margin, y, { align: "right" });
    y += 4.5;
  }
  hr();

  // Totais
  const subtotal = sale.lines.reduce((s, l) => s + l.qty * l.unit, 0);
  const totRow = (label: string, value: string, bold = false) => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10 : 9);
    doc.text(label, margin, y);
    doc.text(value, W - margin, y, { align: "right" });
    y += bold ? 5 : 4;
  };
  totRow("Subtotal", brl(subtotal));
  if (sale.cashbackUsed > 0) totRow("Cashback usado", `- ${brl(sale.cashbackUsed)}`);
  totRow("TOTAL", brl(sale.total), true);
  hr();

  // Pagamentos
  line("Pagamentos", { bold: true, size: 9 });
  for (const p of sale.payments) {
    doc.setFont(font, "normal");
    doc.setFontSize(8.5);
    doc.text(`${paymentLabels[p.method]}${p.ref ? " · " + p.ref : ""}`, margin, y);
    doc.text(brl(p.amount), W - margin, y, { align: "right" });
    y += 4;
  }
  hr();

  // QR PIX se houver pagamento PIX
  const hasPix = sale.payments.some((p) => p.method === "pix");
  if (hasPix) {
    line("PIX · Mercado Pago", { bold: true, size: 9, align: "center" });
    const dataUrl = await QRCode.toDataURL(PIX_PAYLOAD, { margin: 0, width: 240 });
    const size = Math.min(40, W - margin * 2 - 4);
    doc.addImage(dataUrl, "PNG", (W - size) / 2, y, size, size);
    y += size + 2;
    line("Chave: ksmultimake@mercadopago.com.br", { size: 7, align: "center" });
    hr();
  }

  // Rodapé customizável
  const footerLines = settings.footer.split("\n");
  for (const f of footerLines) {
    if (f.trim()) line(f, { size: 8, align: "center" });
  }

  return doc;
}

export async function downloadSaleReceipt(
  sale: Sale,
  settings?: ReceiptSettings,
) {
  const doc = await buildSaleReceipt(sale, settings);
  doc.save(`comprovante-${sale.id}.pdf`);
}
