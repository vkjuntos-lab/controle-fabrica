// Onda M — Camada de agregação BI (Sprint M1) + comparativos/insights (Sprint M4).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

const rangeSchema = z.object({
  from: z.string(), // ISO date
  to: z.string(),
  storeId: z.string().uuid().nullable().optional(),
});
type Range = z.infer<typeof rangeSchema>;

async function fetchSales(
  supabase: AnyClient,
  r: Range,
  columns: string = "id, code, created_at, customer_id, store_id, total, lines, payments",
) {
  // Perf: usa índice composto (store_id, created_at) e projeta somente
  // as colunas necessárias por endpoint — evita transferir jsonb pesado.
  let q = supabase.from("sales")
    .select(columns)
    .gte("created_at", r.from).lte("created_at", r.to)
    .order("created_at", { ascending: true })
    .limit(50000);
  if (r.storeId) q = q.eq("store_id", r.storeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

function ymd(iso: string) { return iso.slice(0, 10); }
function ym(iso: string) { return iso.slice(0, 7); }
function safe(n: any) { return Number(n || 0); }

/* ============ BI overview ============ */
export const biOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Range) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const sales = await fetchSales(supabase, data, "id, created_at, customer_id, total, payments");

    // Previous period para comparativo
    const spanMs = new Date(data.to).getTime() - new Date(data.from).getTime();
    const prevFrom = new Date(new Date(data.from).getTime() - spanMs).toISOString();
    const prevTo = data.from;
    const prevSales = await fetchSales(supabase, { ...data, from: prevFrom, to: prevTo }, "id, total");

    const revenue = sales.reduce((s, x) => s + safe(x.total), 0);
    const prevRevenue = prevSales.reduce((s, x) => s + safe(x.total), 0);
    const count = sales.length;
    const avgTicket = count ? revenue / count : 0;
    const uniqueCustomers = new Set(sales.map(s => s.customer_id).filter(Boolean)).size;

    // Faturamento diário
    const byDay = new Map<string, { date: string; revenue: number; count: number }>();
    for (const s of sales) {
      const k = ymd(s.created_at);
      const cur = byDay.get(k) ?? { date: k, revenue: 0, count: 0 };
      cur.revenue += safe(s.total); cur.count += 1;
      byDay.set(k, cur);
    }
    const daily = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Mix por método de pagamento
    const byMethod = new Map<string, number>();
    for (const s of sales) {
      const pays = Array.isArray(s.payments) ? s.payments : [];
      for (const p of pays) {
        const m = String(p?.method ?? "outro");
        byMethod.set(m, (byMethod.get(m) ?? 0) + safe(p?.amount));
      }
    }
    const paymentMix = Array.from(byMethod.entries()).map(([method, amount]) => ({ method, amount }));

    // Novos clientes no período
    const { count: newCustomers } = await supabase.from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", data.from).lte("created_at", data.to);

    // Insights
    const insights: string[] = [];
    const delta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
    if (Math.abs(delta) >= 5) {
      insights.push(`Faturamento ${delta > 0 ? "cresceu" : "caiu"} ${Math.abs(delta).toFixed(1)}% vs. período anterior (R$ ${revenue.toFixed(2)} vs R$ ${prevRevenue.toFixed(2)}).`);
    }
    if (avgTicket > 0) insights.push(`Ticket médio: R$ ${avgTicket.toFixed(2)} em ${count} vendas.`);
    if ((newCustomers ?? 0) > 0) insights.push(`${newCustomers} novos clientes cadastrados no período.`);
    if (daily.length > 1) {
      const best = daily.reduce((a, b) => (b.revenue > a.revenue ? b : a));
      insights.push(`Melhor dia: ${best.date} com R$ ${best.revenue.toFixed(2)}.`);
    }

    return {
      revenue, prevRevenue, deltaPct: delta,
      count, prevCount: prevSales.length,
      avgTicket, uniqueCustomers, newCustomers: newCustomers ?? 0,
      daily, paymentMix, insights,
    };
  });

/* ============ Top produtos + ABC ============ */
export const biTopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Range) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const sales = await fetchSales(supabase, data, "id, lines");
    const byProd = new Map<string, { sku: string; name: string; qty: number; revenue: number }>();
    for (const s of sales) {
      const lines = Array.isArray(s.lines) ? s.lines : [];
      for (const l of lines) {
        const key = String(l?.sku ?? l?.name ?? "?");
        const cur = byProd.get(key) ?? { sku: key, name: String(l?.name ?? key), qty: 0, revenue: 0 };
        cur.qty += safe(l?.qty); cur.revenue += safe(l?.qty) * safe(l?.unit);
        byProd.set(key, cur);
      }
    }
    const rows = Array.from(byProd.values()).sort((a, b) => b.revenue - a.revenue);
    const total = rows.reduce((s, r) => s + r.revenue, 0);
    let cum = 0;
    const withAbc = rows.map(r => {
      cum += r.revenue;
      const cumPct = total ? (cum / total) * 100 : 0;
      const abc = cumPct <= 80 ? "A" : cumPct <= 95 ? "B" : "C";
      return { ...r, cumPct, abc };
    });
    return { rows: withAbc, total };
  });

/* ============ Top clientes + LTV ============ */
export const biTopCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Range) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const sales = await fetchSales(supabase, data, "id, created_at, customer_id, total");
    const byCust = new Map<string, { customerId: string; revenue: number; orders: number; last: string }>();
    for (const s of sales) {
      if (!s.customer_id) continue;
      const cur = byCust.get(s.customer_id) ?? { customerId: s.customer_id, revenue: 0, orders: 0, last: s.created_at };
      cur.revenue += safe(s.total); cur.orders += 1;
      if (s.created_at > cur.last) cur.last = s.created_at;
      byCust.set(s.customer_id, cur);
    }
    const ids = Array.from(byCust.keys());
    if (ids.length === 0) return { rows: [] };
    const { data: custs } = await supabase.from("customers").select("id, name, cpf, phone").in("id", ids);
    const nameById = new Map((custs ?? []).map((c: any) => [c.id, c]));
    const rows = Array.from(byCust.values())
      .map(c => ({
        ...c,
        name: (nameById.get(c.customerId) as any)?.name ?? "—",
        cpf: (nameById.get(c.customerId) as any)?.cpf ?? "",
        phone: (nameById.get(c.customerId) as any)?.phone ?? "",
        ticket: c.orders ? c.revenue / c.orders : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);
    return { rows };
  });

/* ============ Cohort de retenção (mês cadastro × mês recompra) ============ */
export const biCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Range) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const sales = await fetchSales(supabase, data, "id, created_at, customer_id");
    const customerIds = Array.from(new Set(sales.map(s => s.customer_id).filter(Boolean))) as string[];
    if (customerIds.length === 0) return { cohorts: [], months: [] };
    const { data: custs } = await supabase.from("customers").select("id, created_at").in("id", customerIds);
    const cohortOf = new Map<string, string>();
    for (const c of (custs ?? []) as any[]) cohortOf.set(c.id, ym(c.created_at));

    // Matriz cohortMonth -> {size, retention: {month: uniqueBuyers}}
    const cohortSize = new Map<string, Set<string>>();
    const activity = new Map<string, Map<string, Set<string>>>();
    for (const s of sales) {
      if (!s.customer_id) continue;
      const cm = cohortOf.get(s.customer_id); if (!cm) continue;
      const pm = ym(s.created_at);
      if (!cohortSize.has(cm)) cohortSize.set(cm, new Set());
      cohortSize.get(cm)!.add(s.customer_id);
      if (!activity.has(cm)) activity.set(cm, new Map());
      const inner = activity.get(cm)!;
      if (!inner.has(pm)) inner.set(pm, new Set());
      inner.get(pm)!.add(s.customer_id);
    }
    const months = Array.from(new Set(sales.map(s => ym(s.created_at)))).sort();
    const cohorts = Array.from(cohortSize.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([cm, set]) => {
      const size = set.size;
      const row = months.map(m => {
        const active = activity.get(cm)?.get(m)?.size ?? 0;
        return { month: m, active, pct: size ? (active / size) * 100 : 0 };
      });
      return { cohort: cm, size, row };
    });
    return { cohorts, months };
  });
