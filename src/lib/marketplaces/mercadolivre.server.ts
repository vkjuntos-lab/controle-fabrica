import { 
  MarketplaceDriver, 
  MarketplaceProduct, 
  MarketplaceOrder, 
  MarketplaceProvider, 
  MarketplaceNotImplementedError 
} from "./types";

export class MercadoLivreDriver implements MarketplaceDriver {
  readonly provider: MarketplaceProvider = "mercadolivre";
  readonly label: string = "Mercado Livre";

  constructor(private config: { access_token: string; user_id: string }) {}

  async listProducts(): Promise<MarketplaceProduct[]> {
    if (!this.config.access_token) return [];
    
    try {
      // 1. Buscar IDs dos itens do usuário
      const searchResp = await fetch(
        `https://api.mercadolibre.com/users/${this.config.user_id}/items/search`,
        {
          headers: { Authorization: `Bearer ${this.config.access_token}` }
        }
      );
      
      if (!searchResp.ok) return [];
      const searchData = await searchResp.json();
      const itemIds: string[] = searchData.results || [];
      
      if (itemIds.length === 0) return [];

      // 2. Buscar detalhes dos itens (limite de 20 por vez na API multiget)
      const products: MarketplaceProduct[] = [];
      const chunks = [];
      for (let i = 0; i < itemIds.length; i += 20) {
        chunks.push(itemIds.slice(i, i + 20));
      }

      for (const chunk of chunks) {
        const ids = chunk.join(",");
        const detailResp = await fetch(
          `https://api.mercadolibre.com/items?ids=${ids}`,
          {
            headers: { Authorization: `Bearer ${this.config.access_token}` }
          }
        );
        
        if (detailResp.ok) {
          const details = await detailResp.json();
          for (const item of details) {
            if (item.code === 200 && item.body) {
              const b = item.body;
              products.push({
                external_id: b.id,
                sku: b.seller_custom_field || b.sku || null,
                title: b.title,
                price: b.price,
                stock: b.available_quantity,
                images: b.pictures?.map((p: any) => p.url) || [],
                active: b.status === "active",
              });
            }
          }
        }
      }
      
      return products;
    } catch (error) {
      console.error("[MeliDriver] listProducts error:", error);
      return [];
    }
  }

  async pushProduct(input: MarketplaceProduct): Promise<{ external_id: string }> {
    throw new MarketplaceNotImplementedError(this.provider, "pushProduct");
  }

  async updateStock(external_id: string, stock: number): Promise<void> {
    if (!this.config.access_token) return;
    
    await fetch(`https://api.mercadolibre.com/items/${external_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        available_quantity: stock,
      }),
    });
  }

  async listOrders(sinceISO?: string): Promise<MarketplaceOrder[]> {
    if (!this.config.access_token) return [];
    
    try {
      const url = new URL(`https://api.mercadolibre.com/orders/search`);
      url.searchParams.set("seller", this.config.user_id);
      if (sinceISO) {
        url.searchParams.set("order.date_created.from", sinceISO);
      }

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.config.access_token}` }
      });
      
      if (!resp.ok) return [];
      const data = await resp.json();
      
      return (data.results || []).map((o: any) => ({
        external_id: String(o.id),
        status: this.mapStatus(o.status),
        total: o.total_amount,
        currency: o.currency_id,
        buyer: {
          name: `${o.buyer?.first_name || ""} ${o.buyer?.last_name || ""}`.trim(),
          email: o.buyer?.email,
          document: o.buyer?.billing_info?.doc_number,
        },
        items: (o.order_items || []).map((i: any) => ({
          sku: i.item?.seller_custom_field || null,
          qty: i.quantity,
          unit_price: i.unit_price,
          title: i.item?.title || "Produto Meli",
        })),
        created_at: o.date_created,
      }));
    } catch (error) {
      console.error("[MeliDriver] listOrders error:", error);
      return [];
    }
  }

  private mapStatus(status: string): MarketplaceOrder["status"] {
    switch (status) {
      case "paid": return "paid";
      case "shipped": return "shipped";
      case "delivered": return "delivered";
      case "cancelled": return "cancelled";
      default: return "created";
    }
  }

  async ping(): Promise<{ ok: boolean; message?: string }> {
    if (!this.config.access_token) return { ok: false, message: "Token ausente" };
    return { ok: true, message: "Conectado ao Mercado Livre" };
  }
}
