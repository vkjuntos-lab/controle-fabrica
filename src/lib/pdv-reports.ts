import { supabase } from "@/integrations/supabase/client";
import type { PaymentMethod, SaleLine, Payment } from "./pdv-store";
import { fetchCatalog, fetchExpiringLots, type ExpiringLot } from "./pdv-catalog";

type AnyClient = { from: (t: string) => any };
const db = supabase as unknown as AnyClient;

export type RangePreset = "24h" | "7d" | "30d" | "90d";

export function rangeFromPreset(p: RangePreset): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  if (p === "24h") start.setHours(start.getHours() - 24);
  else if (p === "7d") start.setDate(start.getDate() - 7);
  else if (p === "30d") start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 90);
  return { start, end };
}

export type SaleRow = {
  id: string;
  code: string;
  operator: string | null;
  total: number;
  cashback_used: number;
  lines: SaleLine[];
  payments: Payment[];
  customer_id: string | null;
  created_at: string;
};

export type ReportSummary = {
  count: number;
  revenue: number;
  ticket: number;
  cashbackUsed: number;
  cashbackEarned: number;
  uniqueCustomers: number;
  byDay: { date: string; revenue: number; count: number }[];
  byOperator: { operator: string; revenue: number; count: number }[];
  byMethod: Record<PaymentMethod, number>;
  topProducts: { sku: string; name: string; qty: number; revenue: number }[];
};

export type LowStockItem = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
};

export async function fetchSalesRange(
  start: Date,
  end: Date,
  storeId?: string | null,
): Promise<SaleRow[]> {
  let q = db
    .from("sales")
    .select("id, code, operator, total, cashback_used, lines, payments, customer_id, created_at, store_id")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: true });
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SaleRow[];
}

const emptyMethods = (): Record<PaymentMethod, number> => ({
  cash: 0, pix: 0, debit: 0, credit: 0, cashback: 0,
  gift_card: 0, store_credit: 0, credit_sale: 0, boleto: 0, payment_link: 0,
});

export function summarize(sales: SaleRow[]): ReportSummary {
  const byDayMap = new Map<string, { revenue: number; count: number }>();
  const byOpMap = new Map<string, { revenue: number; count: number }>();
  const byMethod = emptyMethods();
  const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
  const customers = new Set<string>();
  let revenue = 0;
  let cashbackUsed = 0;

  for (const s of sales) {
    const total = Number(s.total);
    revenue += total;
    cashbackUsed += Number(s.cashback_used);
    if (s.customer_id) customers.add(s.customer_id);

    const day = s.created_at.slice(0, 10);
    const d = byDayMap.get(day) ?? { revenue: 0, count: 0 };
    d.revenue += total; d.count += 1;
    byDayMap.set(day, d);

    const op = s.operator || "—";
    const o = byOpMap.get(op) ?? { revenue: 0, count: 0 };
    o.revenue += total; o.count += 1;
    byOpMap.set(op, o);

    for (const p of s.payments ?? []) {
      if (p.status !== "paid") continue;
      byMethod[p.method] += Number(p.amount);
    }
    for (const l of s.lines ?? []) {
      const t = topMap.get(l.sku) ?? { name: l.name, qty: 0, revenue: 0 };
      t.qty += l.qty;
      t.revenue += l.qty * l.unit;
      topMap.set(l.sku, t);
    }
  }

  const count = sales.length;
  return {
    count,
    revenue,
    ticket: count ? revenue / count : 0,
    cashbackUsed,
    cashbackEarned: Math.round(revenue * 0.02 * 100) / 100,
    uniqueCustomers: customers.size,
    byDay: [...byDayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
    byOperator: [...byOpMap.entries()]
      .map(([operator, v]) => ({ operator, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byMethod,
    topProducts: [...topMap.entries()]
      .map(([sku, v]) => ({ sku, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10),
  };
}

export async function fetchLowStock(threshold = 5): Promise<LowStockItem[]> {
  const catalog = await fetchCatalog();
  return catalog
    .map((p) => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      qty: p.lots.reduce((s, l) => s + l.qty, 0),
    }))
    .filter((r) => r.qty <= threshold)
    .sort((a, b) => a.qty - b.qty);
}

export async function fetchExpiringAlerts(days = 60): Promise<ExpiringLot[]> {
  return fetchExpiringLots(days);
}
