// Onda P — Gestão de Carrinhos Segurados (Hold Cart) e Contingência Offline.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

/* ---------------- HOLD CARTS (Segurar Carrinho) ---------------- */

const holdSchema = z.object({
  store_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  items: z.array(z.any()),
  total: z.number(),
  notes: z.string().max(200).nullable().optional(),
});

export const holdCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof holdSchema>) => holdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { userId } = context as any;
    
    const { data: row, error } = await supabase.from("pdv_hold_carts").insert({
      store_id: data.store_id,
      user_id: userId,
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      items: data.items,
      total: data.total,
      notes: data.notes ?? null,
      status: "held"
    }).select("id").single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listHeldCarts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: rows, error } = await supabase
      .from("pdv_hold_carts")
      .select("*")
      .eq("store_id", data.store_id)
      .eq("status", "held")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { carts: rows ?? [] };
  });

export const resumeHeldCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cart_id: string }) => z.object({ cart_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase
      .from("pdv_hold_carts")
      .update({ status: "resumed", resumed_at: new Date().toISOString() })
      .eq("id", data.cart_id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- OFFLINE SYNC (Contingência) ---------------- */

const syncSchema = z.object({
  store_id: z.string().uuid(),
  sales: z.array(z.object({
    offline_id: z.string(),
    customer_id: z.string().uuid().nullable().optional(),
    items: z.array(z.any()),
    payments: z.array(z.any()),
    total: z.number(),
    created_at: z.string(),
  })),
});

export const syncOfflineSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof syncSchema>) => syncSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { userId } = context as any;
    
    const results = [];
    for (const sale of data.sales) {
      // Tenta inserir na tabela de vendas principal
      const { data: row, error } = await supabase.from("sales").insert({
        store_id: data.store_id,
        user_id: userId,
        customer_id: sale.customer_id,
        items: sale.items,
        payments: sale.payments,
        total: sale.total,
        created_at: sale.created_at,
        metadata: { offline_id: sale.offline_id, synced_at: new Date().toISOString() }
      }).select("id").single();

      results.push({
        offline_id: sale.offline_id,
        success: !error,
        error: error?.message,
        sale_id: row?.id
      });
    }

    return { results };
  });
