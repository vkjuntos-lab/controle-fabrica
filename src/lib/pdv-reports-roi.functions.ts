// Onda 6 — ROI de campanhas Bella IA (por tipo de campanha e cupom).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any };

export const getBellaCampaignRoi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id?: string | null; days?: number }) =>
    z
      .object({
        store_id: z.string().uuid().nullish(),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();

    let runsQ = supabase
      .from("bella_campaign_runs")
      .select("campaign_type,channel,coupon_code,send_ok,store_id,customer_id,created_at")
      .gte("created_at", since);
    if (data.store_id) runsQ = runsQ.eq("store_id", data.store_id);
    const { data: runs, error: e1 } = await runsQ;
    if (e1) throw new Error(e1.message);
    const list = runs ?? [];

    const coupons = Array.from(
      new Set(list.map((r: any) => r.coupon_code).filter(Boolean)),
    ) as string[];

    let redemptions: any[] = [];
    if (coupons.length) {
      const { data: red } = await supabase
        .from("coupon_redemptions")
        .select("coupon_code,discount_value,sale_id,created_at")
        .in("coupon_code", coupons)
        .gte("created_at", since);
      redemptions = red ?? [];
    }

    // Group by campaign_type
    const byType = new Map<
      string,
      { sends: number; delivered: number; unique: Set<string>; revenue: number; discount: number; conversions: number }
    >();
    for (const r of list) {
      const key = r.campaign_type ?? "outros";
      const g =
        byType.get(key) ??
        { sends: 0, delivered: 0, unique: new Set<string>(), revenue: 0, discount: 0, conversions: 0 };
      g.sends += 1;
      if (r.send_ok) g.delivered += 1;
      if (r.customer_id) g.unique.add(r.customer_id);
      byType.set(key, g);
    }

    // Attribute redemptions to campaign_type via coupon_code
    const couponToType = new Map<string, string>();
    for (const r of list) {
      if (r.coupon_code && !couponToType.has(r.coupon_code)) {
        couponToType.set(r.coupon_code, r.campaign_type ?? "outros");
      }
    }
    for (const red of redemptions) {
      const type = couponToType.get(red.coupon_code);
      if (!type) continue;
      const g = byType.get(type);
      if (!g) continue;
      g.discount += Number(red.discount_value ?? 0);
      g.conversions += 1;
    }

    const saleIds = Array.from(new Set(redemptions.map((r) => r.sale_id).filter(Boolean)));
    if (saleIds.length) {
      const { data: sales } = await supabase
        .from("sales")
        .select("id,total")
        .in("id", saleIds);
      const saleTotal = new Map<string, number>();
      (sales ?? []).forEach((s: any) => saleTotal.set(s.id, Number(s.total ?? 0)));
      for (const red of redemptions) {
        const type = couponToType.get(red.coupon_code);
        if (!type) continue;
        const g = byType.get(type);
        if (!g) continue;
        g.revenue += saleTotal.get(red.sale_id) ?? 0;
      }
    }

    const rows = Array.from(byType.entries()).map(([campaign_type, g]) => ({
      campaign_type,
      sends: g.sends,
      delivered: g.delivered,
      unique_customers: g.unique.size,
      conversions: g.conversions,
      revenue: Number(g.revenue.toFixed(2)),
      discount: Number(g.discount.toFixed(2)),
      conv_rate: g.delivered ? Number(((g.conversions / g.delivered) * 100).toFixed(2)) : 0,
      revenue_per_send: g.sends ? Number((g.revenue / g.sends).toFixed(2)) : 0,
    }));
    rows.sort((a, b) => b.revenue - a.revenue);

    const totals = rows.reduce(
      (a, r) => ({
        sends: a.sends + r.sends,
        delivered: a.delivered + r.delivered,
        conversions: a.conversions + r.conversions,
        revenue: a.revenue + r.revenue,
        discount: a.discount + r.discount,
      }),
      { sends: 0, delivered: 0, conversions: 0, revenue: 0, discount: 0 },
    );

    return { rows, totals };
  });
