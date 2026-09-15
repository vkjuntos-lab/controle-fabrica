// Onda F — Interface plugável para provedores de pagamento.
// Todos os drivers vivem em src/lib/gateways/*.server.ts e são resolvidos
// via registry.server.ts por store_id.

export type GatewayProvider = "mercadopago" | "asaas" | "pagbank" | "pagarme";

export type PaymentMethod = "pix" | "credit" | "debit" | "boleto";

export interface CustomerInfo {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  cpfCnpj?: string | null;
}

export interface SplitRule {
  recipientCustomerId?: string | null;
  recipientName?: string | null;
  asaasWalletId?: string | null;
  mpCollectorId?: string | null;
  percentage?: number | null;   // 0..100
  fixedAmount?: number | null;  // BRL absoluto
  description?: string | null;
}

export interface PaymentIntent {
  amount: number;
  description: string;
  externalRef: string;      // ex: "link:<uuid>", "pix:<sale_code>", "sub:<uuid>"
  expiresAt?: string;       // ISO
  customer?: CustomerInfo;
  returnUrl?: string;       // usado por checkout hospedado
  notificationUrl?: string; // webhook do provedor
  maxInstallments?: number;
  splits?: SplitRule[];     // Onda K — split/marketplace
}

export interface PixResult {
  providerId: string;
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string;
}

export interface CheckoutResult {
  providerId: string;
  initPoint: string;
}

export interface BoletoResult {
  providerId: string;
  barcode: string;
  pdfUrl: string;
  dueDate: string;
}

export type ProviderStatus = "pending" | "approved" | "cancelled" | "expired";

export interface WebhookParsed {
  providerId: string;         // id do pagamento no provedor
  status: ProviderStatus;
  externalRef: string | null;
  amount?: number | null;
  method?: string | null;
  installments?: number | null;
  raw?: unknown;
}

export interface DriverConfig {
  storeId: string | null;      // null quando é o fallback global (MP env)
  provider: GatewayProvider;
  sandbox: boolean;
  config: Record<string, any>; // token/api_key/etc, específico do provedor
}

export interface PaymentGatewayDriver {
  readonly provider: GatewayProvider;
  readonly sandbox: boolean;
  createPix(intent: PaymentIntent): Promise<PixResult>;
  createCheckoutLink(intent: PaymentIntent, methods: PaymentMethod[]): Promise<CheckoutResult>;
  createBoleto?(intent: PaymentIntent): Promise<BoletoResult>;
  getStatus(providerId: string): Promise<ProviderStatus>;
  cancel(providerId: string): Promise<void>;
  parseWebhook(req: Request, rawBody: string): Promise<WebhookParsed | null>;
  ping(): Promise<{ ok: boolean; message?: string }>;
}

export class DriverNotImplementedError extends Error {
  constructor(provider: GatewayProvider, feature: string) {
    super(`Driver ${provider} ainda não implementa "${feature}" — próxima onda.`);
    this.name = "DriverNotImplementedError";
  }
}
