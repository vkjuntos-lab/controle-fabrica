// Registry de drivers de marketplace (server-only).
import type { MarketplaceDriver, MarketplaceProvider } from "./types";
import { MarketplaceNotImplementedError } from "./types";
import { TikTokShopDriver } from "./tiktokshop.server";
import { MercadoLivreDriver } from "./mercadolivre.server";

const stub = (provider: MarketplaceProvider, label: string): MarketplaceDriver => ({
  provider, label,
  async listProducts() { throw new MarketplaceNotImplementedError(provider, "listProducts"); },
  async pushProduct() { throw new MarketplaceNotImplementedError(provider, "pushProduct"); },
  async updateStock() { throw new MarketplaceNotImplementedError(provider, "updateStock"); },
  async listOrders() { throw new MarketplaceNotImplementedError(provider, "listOrders"); },
  async ping() { return { ok: false, message: "driver não configurado (stub)" }; },
});

export async function getMarketplaceDriver(p: MarketplaceProvider, storeId?: string): Promise<MarketplaceDriver> {
  const labels: Record<MarketplaceProvider, string> = {
    mercadolivre: "Mercado Livre",
    shopee: "Shopee",
    nuvemshop: "Nuvemshop",
    shopify: "Shopify",
    tiktokshop: "TikTok Shop",
    amazon: "Amazon",
  };

  if (p === "tiktokshop") return new TikTokShopDriver();
  
  if (p === "mercadolivre") {
    if (storeId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: cfg } = await (supabaseAdmin as any)
        .from("marketplace_configs")
        .select("config")
        .eq("store_id", storeId)
        .eq("provider", "mercadolivre")
        .maybeSingle();

      if (cfg?.config?.access_token) {
        return new MercadoLivreDriver({
          access_token: cfg.config.access_token,
          user_id: cfg.config.user_id || ""
        });
      }
    }
    return new MercadoLivreDriver({ access_token: "", user_id: "" });
  }

  return stub(p, labels[p]);
}

export function listMarketplaceProviders(): Array<{ provider: MarketplaceProvider; label: string }> {
  return [
    { provider: "mercadolivre", label: "Mercado Livre" },
    { provider: "shopee", label: "Shopee" },
    { provider: "nuvemshop", label: "Nuvemshop" },
    { provider: "shopify", label: "Shopify" },
    { provider: "tiktokshop", label: "TikTok Shop" },
    { provider: "amazon", label: "Amazon" },
  ];
}

