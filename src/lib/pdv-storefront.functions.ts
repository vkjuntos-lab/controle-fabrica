// Onda T — Server functions públicas para vitrine (sem auth).
// Usa cliente publishable (chave anon) + RPCs security-definer.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export type StorefrontProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  price: number;
  image: string | null;
  description: string;
  in_stock: boolean;
  stock: number;
  store_slug: string | null;
  store_name: string | null;
  category_slug: string | null;
  category_name: string | null;
};

export type StorefrontStore = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export type StorefrontCategory = {
  id: string;
  slug: string;
  name: string;
  store_slug: string | null;
  product_count: number;
};

export type StorefrontProductDetail = {
  product: StorefrontProduct;
  store: { id: string; name: string; slug: string; whatsapp: string | null } | null;
};

export type StorefrontOrderItem = {
  product_id: string;
  slug: string;
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
  image?: string | null;
};

export type StorefrontOrderPayload = {
  code: string;
  status: string;
  total: number;
  channel: string;
  items: StorefrontOrderItem[];
  notes: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  whatsapp_clicked_at: string | null;
  whatsapp_confirmed_at: string | null;
  reserved_until: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type CartValidationRow = {
  product_id: string;
  requested: number;
  available: number;
  ok: boolean;
};

function publicClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined as any, persistSession: false, autoRefreshToken: false } },
  );
}

function toProduct(row: any): StorefrontProduct {
  const stock = Number(row.stock ?? 0);
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug ?? row.id,
    name: row.name,
    brand: row.brand ?? null,
    price: Number(row.unit_price ?? 0),
    image: row.image_url ?? null,
    description: row.description ?? "",
    stock,
    in_stock: stock > 0,
    store_slug: row.store_slug ?? null,
    store_name: row.store_name ?? null,
    category_slug: row.category_slug ?? null,
    category_name: row.category_name ?? null,
  };
}

export const listStorefrontStores = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("stores")
    .select("id, slug, name, address, phone, storefront_whatsapp")
    .eq("active", true)
    .eq("storefront_public", true)
    .order("name");
  if (error) return [] as StorefrontStore[];
  return (data ?? []).map((s: any) => ({
    id: s.id, slug: s.slug, name: s.name, address: s.address ?? null,
    phone: s.phone ?? null, whatsapp: s.storefront_whatsapp ?? null,
  }));
});

export const listStorefrontProducts = createServerFn({ method: "GET" })
  .inputValidator((d: { store_slug?: string | null; category_slug?: string | null; search?: string | null } | undefined) =>
    z.object({
      store_slug: z.string().optional().nullable(),
      category_slug: z.string().optional().nullable(),
      search: z.string().optional().nullable(),
    }).partial().parse(d ?? {}))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("storefront_list_products", {
      _store_slug: data?.store_slug ?? null,
      _category_slug: data?.category_slug ?? null,
      _search: data?.search ?? null,
      _limit: 200,
    });
    if (error) return [] as StorefrontProduct[];
    return (rows ?? []).map(toProduct);
  });

export const listStorefrontCategories = createServerFn({ method: "GET" })
  .inputValidator((d: { store_slug?: string | null } | undefined) =>
    z.object({ store_slug: z.string().optional().nullable() }).partial().parse(d ?? {}))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("storefront_list_categories", {
      _store_slug: data?.store_slug ?? null,
    });
    if (error) return [] as StorefrontCategory[];
    return (rows ?? []).map((r: any) => ({
      id: r.id, slug: r.slug, name: r.name,
      store_slug: r.store_slug ?? null,
      product_count: Number(r.product_count ?? 0),
    }));
  });

export const getStorefrontCategory = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows } = await sb.rpc("storefront_get_category", { _slug: data.slug });
    const r = (rows ?? [])[0];
    if (!r) return null;
    return {
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      store_slug: (r.store_slug ?? null) as string | null,
      store_name: (r.store_name ?? null) as string | null,
    };
  });

export const getStorefrontProduct = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }): Promise<StorefrontProductDetail | null> => {
    const sb = publicClient();
    const { data: rows } = await sb.rpc("storefront_get_product", { _slug: data.slug });
    const row: any = (rows ?? [])[0];
    if (!row) return null;
    return {
      product: toProduct(row),
      store: row.store_id
        ? { id: row.store_id, name: row.store_name, slug: row.store_slug, whatsapp: row.store_whatsapp ?? null }
        : null,
    };
  });

// --- Storefront orders (carrinho enviado ao PDV) ---
const orderItemSchema = z.object({
  product_id: z.string(),
  slug: z.string(),
  sku: z.string(),
  name: z.string(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  image: z.string().nullable().optional(),
});

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `V-${out}`;
}

export const createStorefrontOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    store_slug: z.string().nullable().optional(),
    channel: z.enum(["whatsapp", "pdv"]),
    customer_name: z.string().max(200).optional().nullable(),
    customer_phone: z.string().max(40).optional().nullable(),
    customer_email: z.string().email().max(200).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    items: z.array(orderItemSchema).min(1).max(50),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    let storeId: string | null = null;
    if (data.store_slug) {
      const { data: s } = await sb.from("stores").select("id")
        .eq("slug", data.store_slug).eq("active", true).eq("storefront_public", true)
        .maybeSingle();
      storeId = (s as any)?.id ?? null;
    }
    // valida estoque servidor-side
    for (const it of data.items) {
      const { data: stockData } = await sb.rpc("storefront_available_stock", { _product_id: it.product_id });
      const stock = Number(stockData ?? 0);
      if (stock < it.qty) {
        return { ok: false as const, error: `Estoque insuficiente para "${it.name}" (disponível: ${stock}).` };
      }
    }
    const total = data.items.reduce((s, it) => s + it.qty * it.unit_price, 0);
    const code = randomCode();
    const { error } = await sb.from("storefront_orders").insert({
      code,
      store_id: storeId,
      status: "pending",
      channel: data.channel,
      customer_name: data.customer_name ?? null,
      customer_phone: data.customer_phone ?? null,
      customer_email: data.customer_email ?? null,
      items: data.items,
      total,
      notes: data.notes ?? null,
    } as any);
    if (error) return { ok: false as const, error: error.message };

    // Canal PDV: já reservamos estoque transacionalmente
    if (data.channel === "pdv") {
      const { data: resv } = await sb.rpc("storefront_reserve_order", { _code: code, _minutes: 30 });
      const row: any = Array.isArray(resv) ? resv[0] : resv;
      if (row && row.ok === false) {
        await sb.rpc("storefront_cancel_order", { _code: code });
        return { ok: false as const, error: row.error ?? "Falha ao reservar estoque." };
      }
    }
    return { ok: true as const, code, total };
  });

export const getStorefrontOrder = createServerFn({ method: "GET" })
  .inputValidator((d: { code: string }) => z.object({ code: z.string() }).parse(d))
  .handler(async ({ data }): Promise<StorefrontOrderPayload | null> => {
    const sb = publicClient();
    const { data: rows } = await sb.rpc("storefront_get_order", { _code: data.code });
    const r: any = (rows ?? [])[0];
    if (!r) return null;
    return {
      code: r.code, status: r.status, total: Number(r.total ?? 0),
      channel: r.channel, items: (r.items ?? []) as StorefrontOrderItem[],
      notes: r.notes ?? null,
      customer_name: r.customer_name ?? null,
      customer_phone: r.customer_phone ?? null,
      whatsapp_clicked_at: r.whatsapp_clicked_at ?? null,
      whatsapp_confirmed_at: r.whatsapp_confirmed_at ?? null,
      reserved_until: r.reserved_until ?? null,
      cancelled_at: r.cancelled_at ?? null,
      created_at: r.created_at,
    };
  });

// Revalida estoque de itens do carrinho
export const validateStorefrontCart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    items: z.array(orderItemSchema).min(1).max(50),
  }).parse(d))
  .handler(async ({ data }): Promise<CartValidationRow[]> => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("storefront_validate_cart", { _items: data.items as any });
    if (error) return data.items.map((it) => ({ product_id: it.product_id, requested: it.qty, available: 0, ok: false }));
    return (rows ?? []).map((r: any) => ({
      product_id: r.product_id, requested: Number(r.requested ?? 0),
      available: Number(r.available ?? 0), ok: !!r.ok,
    }));
  });

// Marca clique/confirmação de WhatsApp
export const markStorefrontWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    code: z.string(),
    confirmed: z.boolean().optional().default(false),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: ok } = await sb.rpc("storefront_mark_whatsapp", {
      _code: data.code, _confirmed: data.confirmed ?? false,
    });
    return { ok: !!ok };
  });

// Atualiza observações do pedido (só quando ainda não confirmado)
export const updateStorefrontOrderNotes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    code: z.string(),
    notes: z.string().max(2000),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: ok, error } = await sb.rpc("storefront_update_order_notes", {
      _code: data.code, _notes: data.notes,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: !!ok };
  });

// Cancela pedido (libera reservas)
export const cancelStorefrontOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: ok, error } = await sb.rpc("storefront_cancel_order", { _code: data.code });
    if (error) return { ok: false as const, error: error.message };
    return { ok: !!ok };
  });
