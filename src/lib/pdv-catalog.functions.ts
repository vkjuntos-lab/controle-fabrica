// Onda C — Módulo de Catálogo: Gestão de Categorias, Tags, Marcas e Integração de Catálogo Online.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any; rpc: (n: string, a: any) => any };

/* ---------------- CATEGORIES (Categorias Hierárquicas) ---------------- */

export const listAllCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: rows, error } = await supabase
      .from("product_categories")
      .select("*")
      .eq("store_id", data.store_id)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return { categories: (rows ?? []) as any[] };
  });

/* ---------------- TAGS & BRANDS (Metadados de Catálogo) ---------------- */

export const listStoreBrands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: rows, error } = await supabase
      .from("products")
      .select("brand")
      .eq("store_id", data.store_id)
      .not("brand", "is", null);

    if (error) throw new Error(error.message);
    const brands: string[] = (rows ?? []).map((r: any) => String(r.brand || ""));
    const uniqueBrands: string[] = Array.from(new Set(brands)).filter(Boolean);
    return { brands: uniqueBrands };
  });

/* ---------------- ONLINE CATALOG SYNC ---------------- */

export const toggleOnlineVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string; is_online: boolean }) => 
    z.object({ product_id: z.string().uuid(), is_online: z.boolean() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase
      .from("products")
      .update({ is_online: data.is_online, updated_at: new Date().toISOString() })
      .eq("id", data.product_id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

/* ---------------- CATALOG AUDIT & DUPLICATES ---------------- */

export const detectDuplicateProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: rows, error } = await supabase.rpc('check_duplicate_products', {
      p_store_id: data.store_id
    });

    if (error) throw new Error(error.message);
    return { duplicates: (rows ?? []) as any[] };
  });
