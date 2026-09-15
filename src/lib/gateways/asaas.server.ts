// Driver Asaas — PIX QR + Boleto + Link de Pagamento (checkout hospedado).
// Docs: https://docs.asaas.com/
import type {
  PaymentGatewayDriver, PaymentIntent, PixResult, CheckoutResult,
  ProviderStatus, WebhookParsed, PaymentMethod, DriverConfig, BoletoResult,
} from "./types";

const BASE_PROD = "https://api.asaas.com/v3";
const BASE_SANDBOX = "https://sandbox.asaas.com/api/v3";

function normDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3 * 86400_000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function statusMap(s: string): ProviderStatus {
  const u = (s || "").toUpperCase();
  if (u === "RECEIVED" || u === "CONFIRMED" || u === "RECEIVED_IN_CASH") return "approved";
  if (u === "REFUNDED" || u === "REFUND_REQUESTED" || u === "CHARGEBACK_REQUESTED" || u === "CHARGEBACK_DISPUTE") return "approved";
  if (u === "CANCELED" || u === "REFUSED") return "cancelled";
  if (u === "OVERDUE") return "expired";
  return "pending";
}

export class AsaasDriver implements PaymentGatewayDriver {
  readonly provider = "asaas" as const;
  readonly sandbox: boolean;
  private base: string;
  private apiKey: string;
  private webhookToken: string;

  constructor(cfg: DriverConfig) {
    this.sandbox = !!cfg.sandbox;
    this.base = this.sandbox ? BASE_SANDBOX : BASE_PROD;
    this.apiKey = cfg.config?.api_key || "";
    this.webhookToken = cfg.config?.webhook_token || "";
    if (!this.apiKey) throw new Error("Asaas: api_key não configurado.");
  }

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        access_token: this.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "KSMultimake-PDV/1.0",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!res.ok) {
      const msg = json?.errors?.[0]?.description || json?.message || text || `HTTP ${res.status}`;
      throw new Error(`Asaas: ${msg}`);
    }
    return json;
  }

  /** Cria (ou reusa) customer no Asaas identificado por externalReference = phone||email. */
  private async ensureCustomer(info?: PaymentIntent["customer"]): Promise<string> {
    const email = info?.email || undefined;
    const phone = (info?.phone || "").replace(/\D+/g, "") || undefined;
    const externalRef = phone || email || `anon-${crypto.randomUUID()}`;

    const q = await this.call(`/customers?externalReference=${encodeURIComponent(externalRef)}&limit=1`, { method: "GET" });
    if (q?.data?.[0]?.id) return q.data[0].id as string;

    const created = await this.call("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: info?.name || "Cliente PDV",
        email,
        mobilePhone: phone,
        cpfCnpj: (info?.cpfCnpj || "").replace(/\D+/g, "") || undefined,
        externalReference: externalRef,
        notificationDisabled: true,
      }),
    });
    return created.id as string;
  }

  /** Converte SplitRule[] → payload nativo do Asaas ({walletId, percentualValue|fixedValue}). */
  private buildSplit(intent: PaymentIntent) {
    const rules = (intent.splits ?? []).filter(r => r.asaasWalletId && ((r.percentage ?? 0) > 0 || (r.fixedAmount ?? 0) > 0));
    if (rules.length === 0) return undefined;
    return rules.map(r => {
      const entry: Record<string, unknown> = { walletId: r.asaasWalletId };
      if (r.fixedAmount && r.fixedAmount > 0) entry.fixedValue = Number(r.fixedAmount.toFixed(2));
      else if (r.percentage && r.percentage > 0) entry.percentualValue = Number(r.percentage.toFixed(2));
      if (r.description) entry.description = String(r.description).slice(0, 500);
      return entry;
    });
  }

  async createPix(intent: PaymentIntent): Promise<PixResult> {
    const customerId = await this.ensureCustomer(intent.customer);
    const dueDate = normDate(intent.expiresAt);

    const split = this.buildSplit(intent);
    const payment = await this.call("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "PIX",
        value: Number(intent.amount.toFixed(2)),
        dueDate,
        description: intent.description.slice(0, 500),
        externalReference: intent.externalRef,
        ...(split ? { split } : {}),
      }),
    });

    const qr = await this.call(`/payments/${payment.id}/pixQrCode`, { method: "GET" });
    const expiresAt = qr.expirationDate ? new Date(qr.expirationDate).toISOString()
      : new Date(dueDate + "T23:59:59Z").toISOString();
    return {
      providerId: payment.id as string,
      qrCode: qr.payload as string,
      qrCodeBase64: qr.encodedImage ? String(qr.encodedImage) : null,
      ticketUrl: payment.invoiceUrl as string,
      expiresAt,
    };
  }

  async createCheckoutLink(intent: PaymentIntent, methods: PaymentMethod[]): Promise<CheckoutResult> {
    // No Asaas o "link de pagamento" (Checkout hospedado) é /paymentLinks
    const chargeTypes: string[] = [];
    if (methods.includes("pix")) chargeTypes.push("PIX");
    if (methods.includes("credit")) chargeTypes.push("CREDIT_CARD");
    if (methods.includes("boleto")) chargeTypes.push("BOLETO");
    if (chargeTypes.length === 0) chargeTypes.push("UNDEFINED");

    const split = this.buildSplit(intent);
    const body: Record<string, unknown> = {
      name: intent.description.slice(0, 100),
      description: intent.description.slice(0, 500),
      chargeType: "DETACHED",
      billingType: chargeTypes.length === 1 ? chargeTypes[0] : "UNDEFINED",
      value: Number(intent.amount.toFixed(2)),
      dueDateLimitDays: 7,
      subscriptionCycle: null,
      maxInstallmentCount: Math.max(1, Math.min(12, intent.maxInstallments ?? 1)),
      notificationEnabled: false,
      externalReference: intent.externalRef,
      ...(split ? { split } : {}),
    };
    if (intent.expiresAt) body.endDate = normDate(intent.expiresAt);

    const link = await this.call("/paymentLinks", { method: "POST", body: JSON.stringify(body) });
    return { providerId: link.id as string, initPoint: link.url as string };
  }

  async createBoleto(intent: PaymentIntent): Promise<BoletoResult> {
    const customerId = await this.ensureCustomer(intent.customer);
    const dueDate = normDate(intent.expiresAt);
    const payment = await this.call("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "BOLETO",
        value: Number(intent.amount.toFixed(2)),
        dueDate,
        description: intent.description.slice(0, 500),
        externalReference: intent.externalRef,
      }),
    });
    const id = payment.id as string;
    const identification = await this.call(`/payments/${id}/identificationField`, { method: "GET" }).catch(() => null);
    return {
      providerId: id,
      barcode: identification?.identificationField ?? "",
      pdfUrl: payment.bankSlipUrl ?? payment.invoiceUrl,
      dueDate,
    };
  }

  async getStatus(providerId: string): Promise<ProviderStatus> {
    const p = await this.call(`/payments/${providerId}`, { method: "GET" });
    return statusMap(String(p?.status ?? ""));
  }

  async cancel(providerId: string): Promise<void> {
    await this.call(`/payments/${providerId}`, { method: "DELETE" });
  }

  async parseWebhook(req: Request, raw: string): Promise<WebhookParsed | null> {
    // Asaas envia header `asaas-access-token` (definido no painel do provedor).
    const provided = req.headers.get("asaas-access-token") ?? "";
    if (!this.webhookToken || provided !== this.webhookToken) return null;

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { return null; }
    const p = payload?.payment;
    if (!p?.id) return null;

    const status = statusMap(String(p.status ?? payload.event ?? ""));
    const eventStr = String(payload.event ?? "");
    const finalStatus: ProviderStatus =
      eventStr === "PAYMENT_RECEIVED" || eventStr === "PAYMENT_CONFIRMED" ? "approved"
      : eventStr === "PAYMENT_DELETED" || eventStr === "PAYMENT_REFUNDED" ? "cancelled"
      : eventStr === "PAYMENT_OVERDUE" ? "expired"
      : status;

    return {
      providerId: String(p.id),
      status: finalStatus,
      externalRef: p.externalReference ?? null,
      amount: Number(p.value ?? 0) || null,
      method: (p.billingType ?? null) as string | null,
      installments: Number(p.installmentCount ?? 0) || null,
      raw: payload,
    };
  }

  async ping() {
    try {
      await this.call("/myAccount", { method: "GET" });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}
