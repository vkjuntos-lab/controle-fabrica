// Driver Pagar.me (Stone) — PIX + Boleto + Checkout hospedado.
// Docs: https://docs.pagar.me/reference/
//
// Autenticação: HTTP Basic com `secret_key` como usuário e senha vazia.
// Valores enviados em centavos (integer).
import type {
  PaymentGatewayDriver, PaymentIntent, PixResult, CheckoutResult,
  ProviderStatus, WebhookParsed, PaymentMethod, DriverConfig, BoletoResult,
} from "./types";

const BASE = "https://api.pagar.me/core/v5";

function toCents(v: number): number { return Math.round(Number(v) * 100); }
function fromCents(v: unknown): number { return Number(v ?? 0) / 100; }
function digits(v?: string | null): string { return String(v ?? "").replace(/\D+/g, ""); }

function dueDateIso(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3 * 86400_000);
  return d.toISOString();
}

function expiresInSeconds(iso?: string): number {
  if (!iso) return 24 * 3600;
  const secs = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  return Math.max(600, Math.min(secs, 30 * 86400));
}

function statusMap(s: string): ProviderStatus {
  const u = (s || "").toLowerCase();
  if (u === "paid" || u === "captured" || u === "authorized_pending_capture" || u === "authorized") return "approved";
  if (u === "canceled" || u === "cancelled" || u === "voided" || u === "refunded" || u === "chargedback" || u === "failed" || u === "not_authorized") return "cancelled";
  return "pending";
}

export class PagarmeDriver implements PaymentGatewayDriver {
  readonly provider = "pagarme" as const;
  readonly sandbox: boolean;
  private secret: string;
  private webhookToken: string;

  constructor(cfg: DriverConfig) {
    this.sandbox = !!cfg.sandbox;
    // Pagar.me v5 usa a mesma base; sandbox = usar chave de teste (sk_test_...).
    this.secret = cfg.config?.secret_key || cfg.config?.api_key || "";
    this.webhookToken = cfg.config?.webhook_token || "";
    if (!this.secret) throw new Error("Pagar.me: secret_key não configurada.");
  }

  private authHeader(): string {
    // HTTP Basic: "secret_key:" em base64.
    const raw = `${this.secret}:`;
    // btoa é global no Worker.
    const b64 = typeof btoa === "function" ? btoa(raw) : Buffer.from(raw, "utf-8").toString("base64");
    return `Basic ${b64}`;
  }

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!res.ok) {
      const errs = json?.errors;
      let msg: string;
      if (Array.isArray(errs)) msg = errs.map((e: any) => e?.message ?? JSON.stringify(e)).join("; ");
      else if (errs && typeof errs === "object") msg = Object.values(errs).flat().join("; ");
      else msg = json?.message || text || `HTTP ${res.status}`;
      throw new Error(`Pagar.me: ${msg}`);
    }
    return json;
  }

  private customerBlock(info?: PaymentIntent["customer"]) {
    const taxId = digits(info?.cpfCnpj);
    const phone = digits(info?.phone);
    const block: Record<string, unknown> = {
      name: info?.name || "Cliente PDV",
      email: info?.email || "cliente@exemplo.com",
      type: taxId && taxId.length === 14 ? "company" : "individual",
    };
    if (taxId) block.document = taxId;
    if (phone && phone.length >= 10) {
      block.phones = {
        mobile_phone: {
          country_code: "55",
          area_code: phone.slice(0, 2),
          number: phone.slice(2),
        },
      };
    }
    return block;
  }

  private baseItem(intent: PaymentIntent) {
    return [{
      amount: toCents(intent.amount),
      description: intent.description.slice(0, 100) || "Cobrança",
      quantity: 1,
      code: intent.externalRef.slice(0, 52),
    }];
  }

  async createPix(intent: PaymentIntent): Promise<PixResult> {
    const body = {
      code: intent.externalRef,
      customer: this.customerBlock(intent.customer),
      items: this.baseItem(intent),
      payments: [{
        payment_method: "pix",
        pix: {
          expires_in: expiresInSeconds(intent.expiresAt),
          additional_information: [{ name: "Descrição", value: intent.description.slice(0, 100) }],
        },
      }],
    };
    const order = await this.call("/orders", { method: "POST", body: JSON.stringify(body) });
    const charge = order?.charges?.[0];
    const tx = charge?.last_transaction ?? {};
    if (!tx.qr_code) throw new Error("Pagar.me: QR não retornado.");
    const expiresAt = tx.expires_at ? new Date(tx.expires_at).toISOString()
      : new Date(Date.now() + expiresInSeconds(intent.expiresAt) * 1000).toISOString();
    return {
      providerId: String(order.id),
      qrCode: String(tx.qr_code),
      qrCodeBase64: null,
      ticketUrl: tx.qr_code_url ?? null,
      expiresAt,
    };
  }

  async createBoleto(intent: PaymentIntent): Promise<BoletoResult> {
    const due = dueDateIso(intent.expiresAt);
    const body = {
      code: intent.externalRef,
      customer: this.customerBlock(intent.customer),
      items: this.baseItem(intent),
      payments: [{
        payment_method: "boleto",
        boleto: {
          instructions: "Pagar antes do vencimento. Não aceitar após a data.",
          due_at: due,
          document_number: intent.externalRef.slice(0, 16),
          type: "DM",
        },
      }],
    };
    const order = await this.call("/orders", { method: "POST", body: JSON.stringify(body) });
    const charge = order?.charges?.[0];
    const tx = charge?.last_transaction ?? {};
    return {
      providerId: String(order.id),
      barcode: String(tx.line ?? tx.barcode ?? ""),
      pdfUrl: String(tx.pdf ?? tx.url ?? ""),
      dueDate: (tx.due_at ?? due).slice(0, 10),
    };
  }

  async createCheckoutLink(intent: PaymentIntent, methods: PaymentMethod[]): Promise<CheckoutResult> {
    const accepted: string[] = [];
    if (methods.includes("credit")) accepted.push("credit_card");
    if (methods.includes("debit")) accepted.push("debit_card");
    if (methods.includes("boleto")) accepted.push("boleto");
    if (methods.includes("pix")) accepted.push("pix");
    if (accepted.length === 0) accepted.push("pix", "credit_card");

    const body = {
      code: intent.externalRef,
      customer: this.customerBlock(intent.customer),
      items: this.baseItem(intent),
      payments: [{
        payment_method: "checkout",
        amount: toCents(intent.amount),
        checkout: {
          expires_in: expiresInSeconds(intent.expiresAt),
          default_payment_method: accepted[0],
          accepted_payment_methods: accepted,
          success_url: intent.returnUrl || "https://pagar.me",
          customer_editable: true,
          skip_checkout_success_page: false,
          billing_address_editable: true,
          credit_card: {
            capture: true,
            statement_descriptor: "KSMULTIMAKE",
            installments: [{
              number: Math.max(1, Math.min(12, intent.maxInstallments ?? 1)),
              total: toCents(intent.amount),
            }],
          },
          boleto: { instructions: "Pagar antes do vencimento.", due_at: dueDateIso(intent.expiresAt) },
          pix: { expires_in: expiresInSeconds(intent.expiresAt) },
        },
      }],
    };
    const order = await this.call("/orders", { method: "POST", body: JSON.stringify(body) });
    const charge = order?.charges?.[0];
    const url = charge?.last_transaction?.url
      ?? charge?.last_transaction?.payment_url
      ?? charge?.checkouts?.[0]?.payment_url
      ?? "";
    if (!url) throw new Error("Pagar.me: URL do checkout não retornada.");
    return { providerId: String(order.id), initPoint: String(url) };
  }

  async getStatus(providerId: string): Promise<ProviderStatus> {
    const order = await this.call(`/orders/${encodeURIComponent(providerId)}`, { method: "GET" });
    const orderStatus = String(order?.status ?? "");
    const chargeStatus = String(order?.charges?.[0]?.status ?? "");
    // Prioriza status da charge, cai no order.
    const mapped = statusMap(chargeStatus || orderStatus);
    return mapped;
  }

  async cancel(providerId: string): Promise<void> {
    const order = await this.call(`/orders/${encodeURIComponent(providerId)}`, { method: "GET" });
    const charges = (order?.charges ?? []) as any[];
    for (const c of charges) {
      if (!c?.id) continue;
      try {
        await this.call(`/charges/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      } catch (e) {
        console.warn("[pagarme] cancel charge falhou:", (e as Error).message);
      }
    }
  }

  async parseWebhook(req: Request, raw: string): Promise<WebhookParsed | null> {
    // Pagar.me v5 assina em `X-Hub-Signature`: "sha256=<hex hmac(raw, secret)>".
    // Aceitamos também token direto para alinhamento com a UI (Asaas/PagBank pattern).
    if (!this.webhookToken) return null;
    const hub = req.headers.get("x-hub-signature") ?? "";
    const provided = req.headers.get("x-authenticity-token") ?? "";
    let ok = false;

    if (provided && provided === this.webhookToken) ok = true;

    if (!ok && hub.startsWith("sha256=")) {
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw", enc.encode(this.webhookToken),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
        );
        const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
        const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
        ok = hex === hub.slice(7).toLowerCase();
      } catch { /* */ }
    }
    if (!ok) return null;

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { return null; }

    // Payload padrão: { type: "order.paid", data: { ...order } } ou charge.*
    const type = String(payload?.type ?? "");
    const data = payload?.data ?? {};

    let orderId: string | null = null;
    let externalRef: string | null = null;
    let charge: any = null;

    if (type.startsWith("order.")) {
      orderId = data?.id ?? null;
      externalRef = data?.code ?? null;
      charge = data?.charges?.[0] ?? null;
    } else if (type.startsWith("charge.")) {
      orderId = data?.order?.id ?? data?.order_id ?? null;
      externalRef = data?.order?.code ?? data?.code ?? null;
      charge = data;
    } else {
      orderId = data?.id ?? data?.order_id ?? null;
      externalRef = data?.code ?? null;
      charge = data?.charges?.[0] ?? data ?? null;
    }
    if (!orderId) return null;

    const rawStatus = String(charge?.status ?? data?.status ?? "");
    const method = String(charge?.payment_method ?? charge?.last_transaction?.transaction_type ?? "").toLowerCase() || null;
    const amount = charge?.amount != null ? fromCents(charge.amount)
      : (data?.amount != null ? fromCents(data.amount) : null);

    return {
      providerId: String(orderId),
      status: statusMap(rawStatus),
      externalRef: externalRef ?? null,
      amount,
      method,
      installments: Number(charge?.last_transaction?.installments ?? 0) || null,
      raw: payload,
    };
  }

  async ping() {
    try {
      const r = await fetch(`${BASE}/orders?size=1`, {
        headers: { Authorization: this.authHeader(), Accept: "application/json" },
      });
      if (r.status === 401 || r.status === 403) return { ok: false, message: "Chave inválida ou sem permissão." };
      if (!r.ok) return { ok: false, message: `HTTP ${r.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}
