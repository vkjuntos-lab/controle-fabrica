// Onda N Sprint N4 — Cupons
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

export const listCoupons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data } = await supabase.from("coupons").select("*").order("created_at", { ascending: false }).limit(200);
    return { rows: data ?? [] };
  });

export const upsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { id, ...rest } = data;
    if (rest.code) rest.code = String(rest.code).toUpperCase().trim();
    if (id) {
      const { error } = await supabase.from("coupons").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: c, error } = await supabase.from("coupons").insert(rest).select("id").single();
    if (error) throw new Error(error.message);
    return { id: c.id };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    await supabase.from("coupons").delete().eq("id", data.id);
    return { ok: true };
  });

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; ticket: number; customer_id?: string }) =>
    z.object({ code: z.string().min(1), ticket: z.number().min(0), customer_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const code = data.code.toUpperCase().trim();
    const { data: c } = await supabase.from("coupons").select("*").eq("code", code).maybeSingle();
    if (!c) return { valid: false, reason: "Cupom não encontrado" };
    if (!c.active) return { valid: false, reason: "Cupom inativo" };
    if (c.valid_until && new Date(c.valid_until).getTime() < Date.now()) return { valid: false, reason: "Cupom expirado" };
    if (c.used_count >= c.max_uses) return { valid: false, reason: "Limite de usos atingido" };
    if (data.ticket < Number(c.min_ticket)) return { valid: false, reason: `Ticket mínimo R$ ${c.min_ticket}` };
    if (c.customer_id && data.customer_id && c.customer_id !== data.customer_id) return { valid: false, reason: "Cupom exclusivo de outro cliente" };
    let discount = 0;
    if (c.kind === "percent") discount = (data.ticket * Number(c.value)) / 100;
    else if (c.kind === "fixed") discount = Math.min(Number(c.value), data.ticket);
    else if (c.kind === "shipping") discount = Number(c.value);
    return { valid: true, coupon: c, discount };
  });

export const redeemCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { coupon_id: string; sale_id?: string; customer_id?: string; discount: number }) =>
    z.object({
      coupon_id: z.string().uuid(),
      sale_id: z.string().optional(),
      customer_id: z.string().uuid().optional(),
      discount: z.number().min(0),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    await supabase.from("coupon_redemptions").insert({
      coupon_id: data.coupon_id, customer_id: data.customer_id, sale_id: data.sale_id,
      discount_amount: data.discount,
    });
    const { data: c } = await supabase.from("coupons").select("used_count").eq("id", data.coupon_id).single();
    await supabase.from("coupons").update({ used_count: (c?.used_count ?? 0) + 1 }).eq("id", data.coupon_id);
    return { ok: true };
  });

export const couponMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data } = await supabase.from("coupon_redemptions").select("discount_amount, coupon_id").limit(5000);
    const totalDiscount = (data ?? []).reduce((s: number, r: any) => s + Number(r.discount_amount || 0), 0);
    const totalRedeems = (data ?? []).length;
    const { count: totalCoupons } = await supabase.from("coupons").select("id", { count: "exact", head: true });
    return { totalCoupons: totalCoupons ?? 0, totalRedeems, totalDiscount };
  });
