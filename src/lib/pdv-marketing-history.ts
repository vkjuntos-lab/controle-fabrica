import { supabase } from "@/integrations/supabase/client";
import type { MarketingPresetKey } from "@/lib/pdv-marketing-photos.functions";
import type { WatermarkConfig } from "@/lib/pdv-marketing-watermark";

export type GenerationStatus = "queued" | "processing" | "done" | "error";

export type GenerationRow = {
  id: string;
  store_id: string;
  product_id: string | null;
  preset: string;
  status: GenerationStatus;
  image_path: string | null;
  error: string | null;
  is_current: boolean;
  created_at: string;
  watermark: WatermarkConfig | null;
};

const BUCKET = "marketing-photos";

export async function uploadGenerationImage(
  storeId: string,
  productId: string | null,
  b64: string,
  mime: string,
): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const id = crypto.randomUUID();
  const path = `${storeId}/${productId ?? "unassigned"}/${id}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}

export async function insertGeneration(row: {
  store_id: string;
  product_id: string | null;
  preset: MarketingPresetKey;
  status: GenerationStatus;
  image_path?: string | null;
  error?: string | null;
  watermark?: WatermarkConfig | null;
}): Promise<GenerationRow> {
  // clear previous "is_current" for same product+preset when this is a done row
  if (row.status === "done" && row.product_id) {
    await supabase
      .from("marketing_photo_generations")
      .update({ is_current: false })
      .eq("product_id", row.product_id)
      .eq("preset", row.preset);
  }
  const { data, error } = await supabase
    .from("marketing_photo_generations")
    .insert({
      store_id: row.store_id,
      product_id: row.product_id,
      preset: row.preset,
      status: row.status,
      image_path: row.image_path ?? null,
      error: row.error ?? null,
      watermark: row.watermark ?? null,
      is_current: row.status === "done",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as GenerationRow;
}

export async function listGenerationsForProduct(
  productId: string,
): Promise<GenerationRow[]> {
  const { data, error } = await supabase
    .from("marketing_photo_generations")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as GenerationRow[];
}

export async function deleteGeneration(row: GenerationRow) {
  if (row.image_path) {
    await supabase.storage.from(BUCKET).remove([row.image_path]);
  }
  const { error } = await supabase
    .from("marketing_photo_generations")
    .delete()
    .eq("id", row.id);
  if (error) throw error;
}

export async function markCurrent(row: GenerationRow) {
  if (!row.product_id) return;
  await supabase
    .from("marketing_photo_generations")
    .update({ is_current: false })
    .eq("product_id", row.product_id)
    .eq("preset", row.preset);
  await supabase
    .from("marketing_photo_generations")
    .update({ is_current: true })
    .eq("id", row.id);
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function downloadGenerationBlob(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) return null;
  return data;
}

/**
 * Copy a marketing generation into the product-images bucket and set as product.image_url.
 * Optionally publishes it on the storefront.
 */
export async function attachGenerationToProduct(opts: {
  productId: string;
  storeId: string;
  imageBlob: Blob;
  publishToStorefront?: boolean;
}): Promise<{ path: string }> {
  const id = crypto.randomUUID();
  const path = `${opts.storeId}/${opts.productId}/${id}.png`;
  const up = await supabase.storage
    .from("product-images")
    .upload(path, opts.imageBlob, { contentType: "image/png", upsert: false });
  if (up.error) throw up.error;
  const patch = opts.publishToStorefront
    ? { image_url: path, storefront_public: true }
    : { image_url: path };
  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", opts.productId);
  if (error) throw error;
  return { path };
}
