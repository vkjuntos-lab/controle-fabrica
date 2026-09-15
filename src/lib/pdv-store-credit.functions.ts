import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StoreCreditMovement = {
  id: string;
  customer_id: string;
  store_id: string;
  type: "credit" | "debit" | "adjustment";
  amount: number;
  balance_after: number;
  source: string;
  source_id: string | null;
  note: string | null;
  created_at: string;
};

export const getStoreCreditBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; storeId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: bal, error } = await context.supabase.rpc("get_store_credit_balance", {
      p_customer_id: data.customerId,
      p_store_id: data.storeId,
    });
    if (error) throw new Error(error.message);
    return Number(bal ?? 0);
  });

export const addStoreCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    customerId: string;
    storeId: string;
    amount: number;
    source?: string;
    sourceId?: string;
    note?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: bal, error } = await context.supabase.rpc("add_store_credit", {
      p_customer_id: data.customerId,
      p_store_id: data.storeId,
      p_amount: data.amount,
      p_source: data.source ?? "manual",
      p_source_id: data.sourceId ?? undefined,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return Number(bal ?? 0);
  });

export const debitStoreCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    customerId: string;
    storeId: string;
    amount: number;
    saleId?: string;
    note?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: bal, error } = await context.supabase.rpc("debit_store_credit", {
      p_customer_id: data.customerId,
      p_store_id: data.storeId,
      p_amount: data.amount,
      p_source: "sale",
      p_source_id: data.saleId ?? undefined,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return Number(bal ?? 0);
  });

export const listStoreCreditMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; storeId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("customer_store_credit_movements")
      .select("id,customer_id,store_id,type,amount,balance_after,source,source_id,note,created_at")
      .eq("customer_id", data.customerId)
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as StoreCreditMovement[];
  });
