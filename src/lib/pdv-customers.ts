import { supabase } from "@/integrations/supabase/client";
import type { Customer, Sale, SaleLine, Payment } from "./pdv-store";

/* ============================================================
 * CPF utils
 * ============================================================ */
export function onlyDigits(v: string) {
  return (v ?? "").replace(/\D+/g, "");
}

export function formatCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function maskCpf(cpf: string) {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return cpf;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function isValidCpf(cpf: string) {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(d.slice(0, 9), 10) === Number(d[9]) && calc(d.slice(0, 10), 11) === Number(d[10]);
}

export function formatPhoneBR(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

/* ============================================================
 * Types
 * ============================================================ */
export type DbCustomer = {
  id: string;
  cpf: string;
  name: string;
  phone: string | null;
  tier: string;
  cashback: number;
};

export type CustomerHistoryItem = {
  id: string;
  code: string;
  createdAt: string;
  total: number;
  cashbackUsed: number;
  itemsCount: number;
};

/* ============================================================
 * Queries
 * ============================================================ */
type AnyClient = { from: (t: string) => any };
const db = supabase as unknown as AnyClient;

export async function findCustomerByCpf(cpf: string, storeId?: string | null): Promise<DbCustomer | null> {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return null;
  const online = typeof navigator === "undefined" || navigator.onLine;

  // Tenta online primeiro
  if (online) {
    try {
      let q = db
        .from("customers")
        .select("id, cpf, name, phone, tier, cashback")
        .eq("cpf", digits);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q.maybeSingle();
      if (!error) {
        if (data) return data as DbCustomer;
        // não achou online → tenta cache mesmo assim
      } else {
        console.warn("[customers] online lookup falhou, tentando cache:", error.message);
      }
    } catch (e) {
      console.warn("[customers] online lookup erro, tentando cache:", e);
    }
  }

  // Fallback offline / miss: consulta cache local
  try {
    const { getCachedCustomers } = await import("./pdv-offline-queue");
    const cached = (await getCachedCustomers()) as DbCustomer[];
    const hit = cached.find((c) => onlyDigits(c.cpf) === digits);
    return hit ?? null;
  } catch {
    return null;
  }
}

/** Hidrata top-N clientes (por cashback + recentes) no IndexedDB para uso offline. */
export async function hydrateTopCustomers(limit = 500): Promise<number> {
  const online = typeof navigator === "undefined" || navigator.onLine;
  if (!online) return 0;
  try {
    const { data, error } = await db
      .from("customers")
      .select("id, cpf, name, phone, tier, cashback")
      .order("cashback", { ascending: false })
      .limit(limit);
    if (error || !data) return 0;
    const { cacheCustomers } = await import("./pdv-offline-queue");
    await cacheCustomers(data);
    return (data as any[]).length;
  } catch (e) {
    console.warn("[customers] hydrateTopCustomers falhou:", e);
    return 0;
  }
}

export async function upsertCustomer(input: {
  id?: string;
  cpf: string;
  name: string;
  phone?: string | null;
  tier?: string;
  cashback?: number;
  storeId: string;
}): Promise<DbCustomer> {
  const digits = onlyDigits(input.cpf);
  const payload: Record<string, unknown> = {
    cpf: digits,
    name: input.name.trim(),
    phone: input.phone ? onlyDigits(input.phone) : null,
    tier: input.tier ?? "Bronze",
    cashback: input.cashback ?? 0,
    store_id: input.storeId,
  };
  if (input.id) payload.id = input.id;
  const { data, error } = await db
    .from("customers")
    .upsert(payload, { onConflict: "store_id,cpf" })
    .select("id, cpf, name, phone, tier, cashback")
    .single();
  if (error) throw error;
  return data as DbCustomer;
}

export async function updateCustomerCashback(id: string, cashback: number) {
  const { error } = await db.from("customers").update({ cashback }).eq("id", id);
  if (error) throw error;
}

export async function fetchCustomerHistory(customerId: string, limit = 20): Promise<CustomerHistoryItem[]> {
  const { data, error } = await db
    .from("sales")
    .select("id, code, created_at, total, cashback_used, lines")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string;
    code: string;
    created_at: string;
    total: number;
    cashback_used: number;
    lines: unknown;
  }>).map((s) => ({
    id: s.id,
    code: s.code,
    createdAt: s.created_at,
    total: Number(s.total),
    cashbackUsed: Number(s.cashback_used),
    itemsCount: Array.isArray(s.lines) ? s.lines.length : 0,
  }));
}

export async function recordSale(input: {
  sale: Sale;
  customerId: string | null;
  operator?: string | null;
  operatorUserId?: string | null;
  sessionId?: string | null;
  storeId: string;
}) {
  const { sale, customerId, operator, sessionId, storeId, operatorUserId } = input;
  const payload = {
    code: sale.id,
    customer_id: customerId,
    session_id: sessionId ?? null,
    store_id: storeId,
    operator_user_id: operatorUserId ?? null,
    operator: operator ?? null,
    total: sale.total,
    cashback_used: sale.cashbackUsed,
    lines: sale.lines as unknown as SaleLine[],
    payments: sale.payments as unknown as Payment[],
  };
  const { error } = await db.from("sales").insert(payload);
  if (error) throw error;
}


/* ============================================================
 * Bridge to in-memory Customer type
 * ============================================================ */
export function toStoreCustomer(row: DbCustomer): Customer & { id: string } {
  return {
    id: row.id,
    name: row.name,
    cpfMasked: maskCpf(row.cpf),
    tier: row.tier,
    cashback: Number(row.cashback),
    phone: row.phone ?? "",
  };
}
