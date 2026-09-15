import { supabase } from "@/integrations/supabase/client";
import type { Product, SaleLine } from "@/lib/pdv-store";

/* ============================================================
 * Utilitários de validade
 *  DB armazena DATE (YYYY-MM-DD, dia 01)
 *  UI usa MM/YYYY
 * ============================================================ */
export function dbDateToMMYYYY(iso: string): string {
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}

export function mmYYYYToDbDate(mmYYYY: string): string {
  const [m, y] = mmYYYY.split("/");
  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}-01`;
}

/* ============================================================
 * Tipos de leitura
 * ============================================================ */
export type CatalogProduct = Product & {
  id: string;
  active: boolean;
  brand?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_signed_url?: string | null;
  category_id?: string | null;
  cost_price?: number | null;
  min_stock?: number;
  volume?: string | null;
  color?: string | null;
  supplier?: string | null;
  tags?: string[];
};

export type ExpiringLot = {
  lot_id: string;
  lot_code: string;
  validity: string;
  qty: number;
  days_left: number;
  product_id: string;
  sku: string;
  product_name: string;
  unit_price?: number;
};

export type StockMovementRow = {
  id: string;
  lot_id: string;
  kind: "entry" | "sale" | "adjust";
  qty: number;
  note: string | null;
  operator: string | null;
  created_at: string;
};

export type Category = {
  id: string;
  store_id: string;
  parent_id: string | null;
  name: string;
  active: boolean;
};

/* ============================================================
 * Fetchers
 *   RLS filtra automaticamente lotes por loja
 * ============================================================ */
export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, ean, name, unit_price, active, brand, description, image_url, category_id, cost_price, min_stock, volume, color, supplier, tags, product_lots(id, lot_code, validity, qty)",
    )
    .order("name", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((p: any) => ({
    id: p.id as string,
    sku: p.sku as string,
    ean: p.ean ?? undefined,
    name: p.name as string,
    unit: Number(p.unit_price),
    active: p.active as boolean,
    brand: p.brand ?? null,
    description: p.description ?? null,
    image_url: p.image_url ?? null,
    image_signed_url: null as string | null,
    category_id: p.category_id ?? null,
    cost_price: p.cost_price != null ? Number(p.cost_price) : null,
    min_stock: p.min_stock ?? 0,
    volume: p.volume ?? null,
    color: p.color ?? null,
    supplier: p.supplier ?? null,
    tags: (p.tags ?? []) as string[],
    lots: ((p.product_lots ?? []) as any[])
      .map((l) => ({
        id: l.id,
        code: l.lot_code,
        validity: dbDateToMMYYYY(l.validity),
        qty: l.qty,
      }))
      .sort((a, b) => a.validity.localeCompare(b.validity)),
  }));

  // Sign URLs em lote (bucket privado)
  const paths = rows
    .filter((r) => r.image_url)
    .map((r) => r.image_url as string);
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from("product-images")
      .createSignedUrls(paths, 3600);
    const map = new Map<string, string>();
    (signed ?? []).forEach((s) => {
      if (s.signedUrl && s.path) map.set(s.path, s.signedUrl);
    });
    rows.forEach((r) => {
      if (r.image_url) r.image_signed_url = map.get(r.image_url) ?? null;
    });
  }
  return rows;
}

export async function fetchCategories(storeId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, store_id, parent_id, name, active")
    .eq("store_id", storeId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function upsertCategory(input: {
  id?: string;
  store_id: string;
  name: string;
  parent_id?: string | null;
  active?: boolean;
}) {
  if (input.id) {
    const { error } = await supabase
      .from("product_categories")
      .update({
        name: input.name,
        parent_id: input.parent_id ?? null,
        active: input.active ?? true,
      })
      .eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase
    .from("product_categories")
    .insert({
      store_id: input.store_id,
      name: input.name,
      parent_id: input.parent_id ?? null,
      active: input.active ?? true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("product_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadProductImage(
  storeId: string,
  file: Blob,
  ext = "jpg",
): Promise<string> {
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type || `image/${ext}`, upsert: false });
  if (error) throw error;
  return path;
}


export async function fetchExpiringLots(days = 90): Promise<ExpiringLot[]> {
  const { data, error } = await supabase
    .from("lots_expiring_soon")
    .select("*")
    .lte("days_left", days)
    .order("validity", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExpiringLot[];
}

export async function fetchLotMovements(lotId: string): Promise<StockMovementRow[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("lot_id", lotId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as StockMovementRow[];
}

/* ============================================================
 * Mutations
 * ============================================================ */
export type ProductInput = {
  id?: string;
  store_id: string;
  sku: string;
  ean?: string | null;
  name: string;
  unit_price: number;
  active?: boolean;
  brand?: string | null;
  description?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  cost_price?: number | null;
  min_stock?: number | null;
  volume?: string | null;
  color?: string | null;
  supplier?: string | null;
  tags?: string[] | null;
  ai_generated?: boolean;
};

export async function upsertProduct(input: ProductInput) {
  const payload = {
    sku: input.sku,
    ean: input.ean ?? null,
    name: input.name,
    unit_price: input.unit_price,
    active: input.active ?? true,
    brand: input.brand ?? null,
    description: input.description ?? null,
    image_url: input.image_url ?? null,
    category_id: input.category_id ?? null,
    cost_price: input.cost_price ?? null,
    min_stock: input.min_stock ?? 0,
    volume: input.volume ?? null,
    color: input.color ?? null,
    supplier: input.supplier ?? null,
    tags: input.tags ?? [],
  };
  if (input.id) {
    const { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase
    .from("products")
    .insert({ ...payload, store_id: input.store_id, ai_generated: input.ai_generated ?? false })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}



export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Entrada de estoque na loja informada.
 * Cria (ou reaproveita) um lote para o produto **na loja** e registra o movimento;
 * o trigger apply_stock_movement atualiza a qty do lote.
 */
export async function stockEntry(input: {
  product_id: string;
  store_id: string;
  operator_user_id?: string | null;
  lot_code: string;
  validity_mmYYYY: string;
  qty: number;
  note?: string;
  operator?: string;
}) {
  const validity = mmYYYYToDbDate(input.validity_mmYYYY);
  // reaproveita se já existir o mesmo lot_code para o produto NA MESMA LOJA
  const { data: existing } = await supabase
    .from("product_lots")
    .select("id")
    .eq("product_id", input.product_id)
    .eq("store_id", input.store_id)
    .eq("lot_code", input.lot_code)
    .maybeSingle();

  let lotId = existing?.id;
  if (!lotId) {
    const { data, error } = await supabase
      .from("product_lots")
      .insert({
        product_id: input.product_id,
        store_id: input.store_id,
        lot_code: input.lot_code,
        validity,
        qty: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    lotId = data.id;
  } else {
    await supabase.from("product_lots").update({ validity }).eq("id", lotId);
  }

  const { error: mErr } = await supabase.from("stock_movements").insert({
    lot_id: lotId,
    store_id: input.store_id,
    operator_user_id: input.operator_user_id ?? null,
    kind: "entry",
    qty: Math.abs(input.qty),
    note: input.note ?? null,
    operator: input.operator ?? null,
  });
  if (mErr) throw mErr;
  return lotId;
}

export async function stockAdjust(input: {
  lot_id: string;
  store_id: string;
  operator_user_id?: string | null;
  qty: number;
  note?: string;
  operator?: string;
}) {
  if (input.qty === 0) return;
  const { error } = await supabase.from("stock_movements").insert({
    lot_id: input.lot_id,
    store_id: input.store_id,
    operator_user_id: input.operator_user_id ?? null,
    kind: "adjust",
    qty: input.qty,
    note: input.note ?? null,
    operator: input.operator ?? null,
  });
  if (error) throw error;
}

export async function deleteLot(id: string) {
  const { error } = await supabase.from("product_lots").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Baixas de estoque de uma venda em uma única chamada.
 */
export async function recordSaleMovements(
  lines: SaleLine[],
  ctx: { storeId: string; operatorUserId?: string | null; operatorName?: string | null },
) {
  if (!lines.length) return;
  const byLot = new Map<string, number>();
  for (const l of lines) byLot.set(l.lotId, (byLot.get(l.lotId) ?? 0) + l.qty);
  const rows = Array.from(byLot.entries()).map(([lot_id, qty]) => ({
    lot_id,
    store_id: ctx.storeId,
    operator_user_id: ctx.operatorUserId ?? null,
    kind: "sale" as const,
    qty,
    operator: ctx.operatorName ?? null,
  }));
  const { error } = await supabase.from("stock_movements").insert(rows);
  if (error) throw error;
}
