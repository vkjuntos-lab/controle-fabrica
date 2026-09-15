// Onda T — Driver TikTok Shop (stub/arquitetura).
import type { MarketplaceDriver, MarketplaceProduct, MarketplaceOrder } from "./types";
import { MarketplaceNotImplementedError } from "./types";

export class TikTokShopDriver implements MarketplaceDriver {
  readonly provider = "tiktokshop";
  readonly label = "TikTok Shop";


  async listProducts(): Promise<MarketplaceProduct[]> {
    // Implementação real usaria fetch para a API do TikTok Shop
    // GET /product/202309/products
    return [];
  }

  async pushProduct(input: MarketplaceProduct): Promise<{ external_id: string }> {
    // POST /product/202309/products
    return { external_id: "tt-" + Math.random().toString(36).substring(7) };
  }

  async updateStock(external_id: string, stock: number): Promise<void> {
    // PUT /product/202309/stocks
  }

  async listOrders(sinceISO?: string): Promise<MarketplaceOrder[]> {
    // GET /order/202309/orders
    return [];
  }

  async ping(): Promise<{ ok: boolean; message?: string }> {
    // Valida tokens e conectividade
    return { ok: true, message: "Conectado à API do TikTok Shop" };
  }
}
