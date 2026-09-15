// Onda S — Contratos de marketplaces (Mercado Livre, Shopee, Nuvemshop, etc.)
// Drivers server-only implementam esta interface e são resolvidos no registry.

export type MarketplaceProvider =
  | "mercadolivre"
  | "shopee"
  | "nuvemshop"
  | "shopify"
  | "tiktokshop"
  | "amazon";

export interface MarketplaceProduct {
  external_id: string;
  sku: string | null;
  title: string;
  price: number;
  stock: number;
  images: string[];
  active: boolean;
}

export interface MarketplaceOrder {
  external_id: string;
  status: "created" | "paid" | "shipped" | "delivered" | "cancelled";
  total: number;
  currency: string;
  buyer: { name?: string; email?: string; document?: string } | null;
  items: Array<{ sku: string | null; qty: number; unit_price: number; title: string }>;
  created_at: string;
}

export interface MarketplaceDriver {
  readonly provider: MarketplaceProvider;
  readonly label: string;
  listProducts(): Promise<MarketplaceProduct[]>;
  pushProduct(input: MarketplaceProduct): Promise<{ external_id: string }>;
  updateStock(external_id: string, stock: number): Promise<void>;
  listOrders(sinceISO?: string): Promise<MarketplaceOrder[]>;
  ping(): Promise<{ ok: boolean; message?: string }>;
}

export class MarketplaceNotImplementedError extends Error {
  constructor(provider: MarketplaceProvider, feature: string) {
    super(`Marketplace ${provider}: "${feature}" ainda não implementado — próxima onda.`);
    this.name = "MarketplaceNotImplementedError";
  }
}
