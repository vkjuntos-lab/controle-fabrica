// Resolve driver ativo para uma loja. Fallback: Mercado Pago via env.
import type { DriverConfig, GatewayProvider, PaymentGatewayDriver } from "./types";
import { MercadoPagoDriver } from "./mercadopago.server";
import { AsaasDriver } from "./asaas.server";
import { PagBankDriver } from "./pagbank.server";
import { PagarmeDriver } from "./pagarme.server";

export function buildDriver(cfg: DriverConfig): PaymentGatewayDriver {
  switch (cfg.provider) {
    case "mercadopago": return new MercadoPagoDriver(cfg);
    case "asaas":       return new AsaasDriver(cfg);
    case "pagbank":     return new PagBankDriver(cfg);
    case "pagarme":     return new PagarmeDriver(cfg);
    default: throw new Error(`Provedor desconhecido: ${cfg.provider}`);
  }
}

/** Resolve o driver padrão da loja. Fallback: MP com env vars. */
export async function resolveDriver(storeId: string | null): Promise<PaymentGatewayDriver> {
  if (storeId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("payment_gateways")
      .select("provider, config, is_default, active")
      .eq("store_id", storeId)
      .eq("active", true)
      .eq("is_default", true)
      .maybeSingle();
    if (data) {
      return buildDriver({
        storeId,
        provider: data.provider as GatewayProvider,
        sandbox: !!data.config?.sandbox,
        config: (data.config ?? {}) as Record<string, any>,
      });
    }
  }
  // Fallback global (retrocompat com env vars pré-Onda F)
  return buildDriver({
    storeId: null,
    provider: "mercadopago",
    sandbox: false,
    config: {
      access_token: process.env.MP_ACCESS_TOKEN,
      webhook_secret: process.env.MP_WEBHOOK_SECRET,
    },
  });
}

/** Lista todos os drivers ativos que podem receber um webhook. Usado por asaas-webhook.ts. */
export async function listActiveDriversByProvider(provider: GatewayProvider): Promise<PaymentGatewayDriver[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("payment_gateways")
    .select("store_id, provider, config, active")
    .eq("provider", provider)
    .eq("active", true);
  return ((data ?? []) as any[]).map((r) => buildDriver({
    storeId: r.store_id,
    provider: r.provider,
    sandbox: !!r.config?.sandbox,
    config: (r.config ?? {}) as Record<string, any>,
  }));
}
