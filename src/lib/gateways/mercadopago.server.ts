// Driver Mercado Pago — encapsula o comportamento pré-existente.
import type {
  PaymentGatewayDriver, PaymentIntent, PixResult, CheckoutResult,
  ProviderStatus, WebhookParsed, PaymentMethod, DriverConfig,
} from "./types";

const MP_BASE = "https://api.mercadopago.com";

export class MercadoPagoDriver implements PaymentGatewayDriver {
  readonly provider = "mercadopago" as const;
  readonly sandbox: boolean;
  private accessToken: string;
  private webhookSecret: string;

  constructor(cfg: DriverConfig) {
    this.sandbox = !!cfg.sandbox;
    this.accessToken = cfg.config?.access_token || process.env.MP_ACCESS_TOKEN || "";
    this.webhookSecret = cfg.config?.webhook_secret || process.env.MP_WEBHOOK_SECRET || "";
    if (!this.accessToken) throw new Error("Mercado Pago: access_token não configurado.");
  }

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${MP_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key":
          (init.headers as Record<string, string> | undefined)?.["X-Idempotency-Key"] ??
          crypto.randomUUID(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!res.ok) {
      const msg = json?.message || json?.error || text || `HTTP ${res.status}`;
      throw new Error(`Mercado Pago: ${msg}`);
    }
    return json;
  }

  /** MP não tem split "PIX simples"; anexamos as regras em metadata para auditoria. */
  private splitMetadata(intent: PaymentIntent) {
    const rules = (intent.splits ?? []).filter(r => (r.percentage ?? 0) > 0 || (r.fixedAmount ?? 0) > 0);
    if (rules.length === 0) return undefined;
    return {
      splits: rules.map(r => ({
        recipient_customer_id: r.recipientCustomerId ?? null,
        recipient_name: r.recipientName ?? null,
        mp_collector_id: r.mpCollectorId ?? null,
        percentage: r.percentage ?? null,
        fixed_amount: r.fixedAmount ?? null,
        description: r.description ?? null,
      })),
    };
  }

  /** Se houver uma única regra para terceiro com valor calculável, aplica como marketplace_fee. */
  private marketplaceFee(intent: PaymentIntent): number | undefined {
    const rules = (intent.splits ?? []).filter(r => r.mpCollectorId && ((r.percentage ?? 0) > 0 || (r.fixedAmount ?? 0) > 0));
    if (rules.length !== 1) return undefined;
    const r = rules[0];
    const fee = r.fixedAmount && r.fixedAmount > 0
      ? intent.amount - Number(r.fixedAmount)
      : intent.amount - (intent.amount * Number(r.percentage!) / 100);
    if (!Number.isFinite(fee) || fee <= 0) return undefined;
    return Number(fee.toFixed(2));
  }

  async createPix(intent: PaymentIntent): Promise<PixResult> {
    const phone = (intent.customer?.phone ?? "").replace(/\D+/g, "");
    const expiresAt = intent.expiresAt ?? new Date(Date.now() + 30 * 60_000).toISOString();
    const meta = this.splitMetadata(intent);
    const mp = await this.call("/v1/payments", {
      method: "POST",
      body: JSON.stringify({
        transaction_amount: Number(intent.amount.toFixed(2)),
        description: intent.description,
        payment_method_id: "pix",
        date_of_expiration: expiresAt,
        payer: {
          email: intent.customer?.email || `pdv+${phone || "anon"}@ksmultimake.local`,
          first_name: intent.customer?.name?.split(" ")[0] || "Cliente",
        },
        external_reference: intent.externalRef,
        ...(meta ? { metadata: meta } : {}),
      }),
    });
    const qr = mp?.point_of_interaction?.transaction_data;
    if (!qr?.qr_code) throw new Error("Mercado Pago não retornou QR PIX.");
    return {
      providerId: String(mp.id),
      qrCode: qr.qr_code,
      qrCodeBase64: qr.qr_code_base64 ?? null,
      ticketUrl: qr.ticket_url ?? null,
      expiresAt,
    };
  }

  async createCheckoutLink(intent: PaymentIntent, methods: PaymentMethod[]): Promise<CheckoutResult> {
    const allow = new Set(methods);
    const excluded: { id: string }[] = [];
    if (!allow.has("credit")) excluded.push({ id: "credit_card" });
    if (!allow.has("debit")) excluded.push({ id: "debit_card" });
    if (!allow.has("pix")) excluded.push({ id: "bank_transfer" });
    if (!allow.has("boleto")) excluded.push({ id: "ticket" });
    excluded.push({ id: "atm" });

    const meta = this.splitMetadata(intent);
    const fee = this.marketplaceFee(intent);
    const body: Record<string, unknown> = {
      items: [{
        id: intent.externalRef,
        title: intent.description,
        quantity: 1,
        unit_price: Number(intent.amount.toFixed(2)),
        currency_id: "BRL",
      }],
      external_reference: intent.externalRef,
      notification_url: intent.notificationUrl,
      back_urls: intent.returnUrl ? {
        success: `${intent.returnUrl}?st=ok`,
        pending: `${intent.returnUrl}?st=pending`,
        failure: `${intent.returnUrl}?st=fail`,
      } : undefined,
      auto_return: "approved",
      payment_methods: {
        excluded_payment_types: excluded,
        installments: Math.max(1, Math.min(12, intent.maxInstallments ?? 1)),
      },
      statement_descriptor: "KS MULTIMAKE",
      ...(fee !== undefined ? { marketplace_fee: fee } : {}),
      ...(meta ? { metadata: meta } : {}),
    };
    const pref = await this.call("/checkout/preferences", { method: "POST", body: JSON.stringify(body) });
    return {
      providerId: pref.id,
      initPoint: pref.init_point ?? pref.sandbox_init_point,
    };
  }

  async getStatus(providerId: string): Promise<ProviderStatus> {
    const mp = await this.call(`/v1/payments/${providerId}`, { method: "GET" });
    const s = String(mp?.status ?? "");
    if (s === "approved") return "approved";
    if (s === "cancelled" || s === "rejected") return "cancelled";
    return "pending";
  }

  async cancel(providerId: string): Promise<void> {
    await this.call(`/v1/payments/${providerId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });
  }

  async parseWebhook(req: Request, _raw: string): Promise<WebhookParsed | null> {
    const url = new URL(req.url);
    if (this.webhookSecret) {
      const s = url.searchParams.get("secret") ?? "";
      if (s !== this.webhookSecret) return null;
    }
    let payload: any = null;
    try { payload = _raw ? JSON.parse(_raw) : null; } catch { payload = null; }
    const type = (payload?.type ?? payload?.topic ?? "").toString();
    const paymentId =
      payload?.data?.id?.toString() ??
      url.searchParams.get("data.id") ??
      url.searchParams.get("id") ??
      null;
    if (!paymentId || (type && !type.includes("payment"))) return null;

    const mp = await this.call(`/v1/payments/${paymentId}`, { method: "GET" });
    const s = String(mp?.status ?? "");
    const status: ProviderStatus = s === "approved" ? "approved"
      : (s === "cancelled" || s === "rejected") ? "cancelled" : "pending";
    return {
      providerId: String(paymentId),
      status,
      externalRef: mp?.external_reference ?? null,
      amount: Number(mp?.transaction_amount ?? 0) || null,
      method: (mp?.payment_type_id ?? mp?.payment_method_id ?? null) as string | null,
      installments: Number(mp?.installments ?? 0) || null,
      raw: mp,
    };
  }

  async ping() {
    try {
      await this.call("/users/me", { method: "GET" });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}
