import { supabase } from "@/integrations/supabase/client";

/* Fluxo de caixa — centros de custo, previsão e histórico consolidado */

export type CostCenterKind = "operacional" | "administrativo" | "marketing" | "vendas" | "outros";

export type CostCenter = {
  id: string;
  store_id: string;
  name: string;
  code: string | null;
  kind: CostCenterKind;
  monthly_budget: number;
  color: string | null;
  active: boolean;
};

export type CostCenterRow = {
  cost_center_id: string | null;
  cost_center_name: string;
  kind: string;
  monthly_budget: number;
  realized_in: number;
  realized_out: number;
  forecast_in: number;
  forecast_out: number;
  net: number;
};

export type ProjectionRow = {
  day: string;
  expected_in: number;
  expected_out: number;
  net: number;
  running_balance: number;
};

export type HistoryRow = {
  month: string;
  realized_in: number;
  realized_out: number;
  net: number;
  accumulated: number;
};

export const COST_CENTER_KINDS: { value: CostCenterKind; label: string }[] = [
  { value: "operacional", label: "Operacional" },
  { value: "administrativo", label: "Administrativo" },
  { value: "marketing", label: "Marketing" },
  { value: "vendas", label: "Vendas" },
  { value: "outros", label: "Outros" },
];

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/* -------- CRUD centros de custo -------- */

export async function listCostCenters(storeId: string, opts?: { includeInactive?: boolean }) {
  let q = db.from("cost_centers").select("*").eq("store_id", storeId).order("name");
  if (!opts?.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as CostCenter[]).map((c) => ({ ...c, monthly_budget: num(c.monthly_budget) }));
}

export async function upsertCostCenter(
  row: Partial<CostCenter> & { store_id: string; name: string },
): Promise<CostCenter> {
  const payload = {
    ...row,
    kind: row.kind ?? "operacional",
    monthly_budget: num(row.monthly_budget),
  };
  const { data, error } = await db.from("cost_centers").upsert(payload).select().single();
  if (error) throw error;
  return data as CostCenter;
}

export async function deleteCostCenter(id: string) {
  const { error } = await db.from("cost_centers").delete().eq("id", id);
  if (error) throw error;
}

/* -------- Relatórios -------- */

export async function cashflowByCostCenter(storeId: string, from: string, to: string) {
  const { data, error } = await db.rpc("cashflow_by_cost_center", {
    _store_id: storeId,
    _from: from,
    _to: to,
  });
  if (error) throw error;
  return ((data ?? []) as CostCenterRow[]).map((r) => ({
    ...r,
    monthly_budget: num(r.monthly_budget),
    realized_in: num(r.realized_in),
    realized_out: num(r.realized_out),
    forecast_in: num(r.forecast_in),
    forecast_out: num(r.forecast_out),
    net: num(r.realized_in) - num(r.realized_out),
  }));
}

export async function cashflowProjection(storeId: string, days = 90) {
  const { data, error } = await db.rpc("cashflow_projection", { _store_id: storeId, _days: days });
  if (error) throw error;
  return ((data ?? []) as ProjectionRow[]).map((r) => ({
    ...r,
    expected_in: num(r.expected_in),
    expected_out: num(r.expected_out),
    net: num(r.net),
    running_balance: num(r.running_balance),
  }));
}

export async function cashflowHistory(storeId: string, months = 12) {
  const { data, error } = await db.rpc("cashflow_history_monthly", {
    _store_id: storeId,
    _months: months,
  });
  if (error) throw error;
  return ((data ?? []) as HistoryRow[]).map((r) => ({
    ...r,
    realized_in: num(r.realized_in),
    realized_out: num(r.realized_out),
    net: num(r.net),
    accumulated: num(r.accumulated),
  }));
}

/* -------- Utilidades -------- */

export function firstNegativeDay(rows: ProjectionRow[]): ProjectionRow | null {
  return rows.find((r) => r.running_balance < 0) ?? null;
}

export function budgetUsage(row: CostCenterRow): number | null {
  if (!row.monthly_budget) return null;
  return (row.realized_out / row.monthly_budget) * 100;
}

export function toCsv(header: string[], rows: (string | number)[][]) {
  return [header.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
