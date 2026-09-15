// Driver PagBank / PagSeguro — PIX QR + Boleto + Link de Pagamento (Checkout).
// Docs: https://developer.pagbank.com.br/reference/
//
// Autenticação: Bearer token (chave privada da conexão de aplicação).
// Valores enviados em centavos (integer).
import type {
  PaymentGatewayDriver, PaymentIntent, PixResult, CheckoutResult,
  ProviderStatus, WebhookParsed, PaymentMethod, DriverConfig, BoletoResult,
} from "./types";

const BASE_PROD = "https://api.pagseguro.com";
const BASE_SANDBOX = "https://sandbox.api.pagseguro.com";

function toCents(v: number): number { return Math.round(Number(v) * 100); }
function fromCents(v: unknown): number { return Number(v ?? 0) / 100; }

function isoExpiry(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600_000);
  return d.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

function dueDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3 * 86400_000);
  return d.toISOString().slice(0, 10);
}

function digits(v?: string | null): string { return String(v ?? "").replace(/\D+/g, ""); }

function statusMap(s: string): ProviderStatus {
  const u = (s || "").toUpperCase();
  if (u === "PAID" || u === "AUTHORIZED") return "approved";
  if (u === "DECLINED" || u === "CANCELED" || u === "CANCELLED") return "cancelled";
  if (u === "EXPIRED") return "expired";
  return "pending"; // IN_ANALYSIS / WAITING / etc.
}

export class PagBankDriver implements PaymentGatewayDriver {
  readonly provider = "pagbank" as const;
  readonly sandbox: boolean;
  private base: string;
  private token: string;
  private webhookToken: string;

  constructor(cfg: DriverConfig) {
    this.sandbox = !!cfg.sandbox;
    this.base = this.sandbox ? BASE_SANDBOX : BASE_PROD;
    this.token = cfg.config?.token || cfg.config?.access_token || "";
    this.webhookToken = cfg.config?.webhook_token || "";
    if (!this.token) throw new Error("PagBank: token não configurado.");
  }

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-version": "4.0",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!res.ok) {
      const err = json?.error_messages?.[0];
      const msg = err ? `${err.code ?? ""} ${err.description ?? ""} ${err.parameter_name ?? ""}`.trim()
        : (json?.message || text || `HTTP ${res.status}`);
      throw new Error(`PagBank: ${msg}`);
    }
    return json;
  }

  private customerBlock(info?: PaymentIntent["customer"]) {
    const taxId = digits(info?.cpfCnpj);
    const phone = digits(info?.phone);
    const block: Record<string, unknown> = {
      name: info?.name || "Cliente PDV",
      email: info?.email || "cliente@exemplo.com",
    };
    if (taxId) block.tax_id = taxId;
    if (phone && phone.length >= 10) {
      block.phones = [{
        country: "55",
        area: phone.slice(0, 2),
        number: phone.slice(2),
        type: phone.length === 11 ? "MOBILE" : "HOME",
      }];
    }
    return block;
  }

  async createPix(intent: PaymentIntent): Promise<PixResult> {
    const body = {
      reference_id: intent.externalRef,
      customer: this.customerBlock(intent.customer),
      items: [{
        reference_id: intent.externalRef,
        name: intent.description.slice(0, 100) || "Cobrança PIX",
        quantity: 1,
        unit_amount: toCents(intent.amount),
      }],
      qr_codes: [{
        amount: { value: toCents(intent.amount) },
        expiration_date: isoExpiry(intent.expiresAt),
      }],
      notification_urls: intent.notificationUrl ? [intent.notificationUrl] : undefined,
    };
    const order = await this.call("/orders", { method: "POST", body: JSON.stringify(body) });
    const qr = order?.qr_codes?.[0];
    if (!qr) throw new Error("PagBank: QR não retornado.");
    const png = (qr.links ?? []).find((l: any) => String(l.rel).toUpperCase() === "QRCODE.PNG");
    return {
      providerId: String(order.id),
      qrCode: String(qr.text ?? ""),
      qrCodeBase64: null, // PagBank devolve apenas URL da imagem, não base64
      ticketUrl: png?.href ?? null,
      expiresAt: String(qr.expiration_date ?? isoExpiry(intent.expiresAt)),
    };
  }

  async createBoleto(intent: PaymentIntent): Promise<BoletoResult> {
    const taxId = digits(intent.customer?.cpfCnpj);
    if (!taxId) throw new Error("PagBank: CPF/CNPJ do cliente é obrigatório para boleto.");
    const due = dueDate(intent.expiresAt);
    const body = {
      reference_id: intent.externalRef,
      customer: this.customerBlock(intent.customer),
      items: [{
        reference_id: intent.externalRef,
        name: intent.description.slice(0, 100) || "Boleto",
        quantity: 1,
        unit_amount: toCents(intent.amount),
      }],
      charges: [{
        reference_id: intent.externalRef,
        description: intent.description.slice(0, 100) || "Boleto",
        amount: { value: toCents(intent.amount), currency: "BRL" },
        payment_method: {
          type: "BOLETO",
          boleto: {
            due_date: due,
            instruction_lines: {
              line_1: "Pagamento processado para KSMultimake PDV",
              line_2: "Via PagBank",
            },
            holder: {
              name: (intent.customer?.name || "Cliente PDV").slice(0, 60),
              tax_id: taxId,
              email: intent.customer?.email || "cliente@exemplo.com",
              address: {
                country: "Brasil", region: "SP", region_code: "SP",
                city: "São Paulo", postal_code: "01310100",
                street: "Av Paulista", number: "1000",
                complement: "s/n", locality: "Bela Vista",
              },
            },
          },
        },
      }],
      notification_urls: intent.notificationUrl ? [intent.notificationUrl] : undefined,
    };
    const order = await this.call("/orders", { method: "POST", body: JSON.stringify(body) });
    const charge = order?.charges?.[0];
    const boleto = charge?.payment_method?.boleto ?? {};
    const links = charge?.links ?? [];
    const pdf = links.find((l: any) => String(l.rel).toUpperCase().includes("PDF"))?.href
      ?? links.find((l: any) => String(l.media).includes("pdf"))?.href
      ?? "";
    return {
      providerId: String(order.id),
      barcode: String(boleto.barcode ?? boleto.formatted_barcode ?? ""),
      pdfUrl: pdf,
      dueDate: due,
    };
  }

  async createCheckoutLink(intent: PaymentIntent, methods: PaymentMethod[]): Promise<CheckoutResult> {
    const pm: any[] = [];
    if (methods.includes("credit")) {
      pm.push({
        type: "CREDIT_CARD",
        brands: ["MASTERCARD", "VISA", "AMEX", "HIPERCARD", "ELO", "DINERS"],
        installments: Math.max(1, Math.min(12, intent.maxInstallments ?? 1)),
      });
    }
    if (methods.includes("debit")) pm.push({ type: "DEBIT_CARD" });
    if (methods.includes("boleto")) pm.push({ type: "BOLETO" });
    if (methods.includes("pix")) pm.push({ type: "PIX" });
    if (pm.length === 0) pm.push({ type: "PIX" }, { type: "CREDIT_CARD" });

    const body: Record<string, unknown> = {
      reference_id: intent.externalRef,
      expiration_date: isoExpiry(intent.expiresAt),
      customer: this.customerBlock(intent.customer),
      customer_modifiable: true,
      items: [{
        reference_id: intent.externalRef,
        name: intent.description.slice(0, 100) || "Cobrança",
        quantity: 1,
        unit_amount: toCents(intent.amount),
      }],
      payment_methods: pm,
      payment_notification_urls: intent.notificationUrl ? [intent.notificationUrl] : undefined,
      redirect_url: intent.returnUrl,
      soft_descriptor: "KSMULTIMAKE",
    };
    const co = await this.call("/checkouts", { method: "POST", body: JSON.stringify(body) });
    const payHref = (co?.links ?? []).find((l: any) => String(l.rel).toUpperCase() === "PAY")?.href
      ?? co?.payment_url ?? "";
    if (!payHref) throw new Error("PagBank: checkout sem URL de pagamento.");
    return { providerId: String(co.id), initPoint: String(payHref) };
  }

  async getStatus(providerId: string): Promise<ProviderStatus> {
    // providerId aqui é o order.id
    const order = await this.call(`/orders/${encodeURIComponent(providerId)}`, { method: "GET" });
    const ch = order?.charges?.[0];
    if (ch) return statusMap(String(ch.status ?? ""));
    // Se ainda não tem charge (PIX pendente), inspeciona qr_codes[].status quando existir
    const qr = order?.qr_codes?.[0];
    if (qr?.status) return statusMap(String(qr.status));
    return "pending";
  }

  async cancel(providerId: string): Promise<void> {
    // Precisa cancelar cada charge do order.
    const order = await this.call(`/orders/${encodeURIComponent(providerId)}`, { method: "GET" });
    const charges = (order?.charges ?? []) as any[];
    for (const c of charges) {
      if (!c?.id) continue;
      try {
        await this.call(`/charges/${encodeURIComponent(c.id)}/cancel`, {
          method: "POST",
          body: JSON.stringify({ amount: { value: c?.amount?.value ?? 0 } }),
        });
      } catch (e) {
        // segue tentando os demais
        console.warn("[pagbank] cancel charge falhou:", (e as Error).message);
      }
    }
  }

  async parseWebhook(req: Request, raw: string): Promise<WebhookParsed | null> {
    // PagBank envia header `x-authenticity-token` (SHA256 do body + token) conforme docs.
    // Para simplificar e alinhar com o padrão da UI, aceitamos o token como valor direto
    // OU como sha256(rawBody + token).
    const provided = req.headers.get("x-authenticity-token")
      ?? req.headers.get("x-authentication")
      ?? "";
    if (!this.webhookToken) return null;

    let ok = provided === this.webhookToken;
    if (!ok && provided) {
      try {
        const enc = new TextEncoder();
        const hash = await crypto.subtle.digest("SHA-256", enc.encode(raw + this.webhookToken));
        const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
        ok = hex === provided.toLowerCase();
      } catch { /* */ }
    }
    if (!ok) return null;

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { return null; }
    // Payload pode ser o Order completo (com id, charges[], reference_id).
    const orderId = payload?.id ?? payload?.order_id ?? payload?.charges?.[0]?.order_id;
    if (!orderId) return null;
    const charge = payload?.charges?.[0];
    const chargeStatus = String(charge?.status ?? payload?.status ?? "");
    const method = String(charge?.payment_method?.type ?? (payload?.qr_codes?.[0] ? "PIX" : "")).toLowerCase() || null;
    const amount = charge?.amount?.value ? fromCents(charge.amount.value)
      : (payload?.qr_codes?.[0]?.amount?.value ? fromCents(payload.qr_codes[0].amount.value) : null);

    return {
      providerId: String(orderId),
      status: statusMap(chargeStatus),
      externalRef: payload?.reference_id ?? charge?.reference_id ?? null,
      amount,
      method,
      installments: Number(charge?.payment_method?.installments ?? 0) || null,
      raw: payload,
    };
  }

  async ping() {
    try {
      // /public-keys/card é público, mas exige autenticação com o token do vendedor.
      const r = await fetch(`${this.base}/public-keys/card`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      });
      if (r.status === 401 || r.status === 403) return { ok: false, message: "Token inválido ou sem permissão." };
      if (!r.ok && r.status !== 404) return { ok: false, message: `HTTP ${r.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}
