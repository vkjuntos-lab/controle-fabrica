import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GiftCard = {
  id: string;
  code: string;
  store_id: string;
  initial_amount: number;
  balance: number;
  status: "active" | "redeemed" | "expired" | "cancelled";
  issued_to_customer_id: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
};

export const issueGiftCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    storeId: string;
    amount: number;
    customerId?: string | null;
    expiresAt?: string | null;
    notes?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("issue_gift_card", {
      p_store_id: data.storeId,
      p_amount: data.amount,
      p_customer_id: data.customerId ?? undefined,
      p_expires_at: data.expiresAt ?? undefined,
      p_notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return row as unknown as GiftCard;
  });

export const lookupGiftCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("gift_cards")
      .select("id,code,store_id,initial_amount,balance,status,issued_to_customer_id,expires_at,notes,created_at")
      .eq("code", data.code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as GiftCard | null) ?? null;
  });

export const redeemGiftCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; amount: number; saleId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("redeem_gift_card", {
      p_code: data.code.trim().toUpperCase(),
      p_amount: data.amount,
      p_sale_id: data.saleId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return row as unknown as GiftCard;
  });

export const cancelGiftCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("cancel_gift_card", { p_id: data.id });
    if (error) throw new Error(error.message);
    return row as unknown as GiftCard;
  });

export const listGiftCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId?: string | null; status?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("gift_cards")
      .select("id,code,store_id,initial_amount,balance,status,issued_to_customer_id,expires_at,notes,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.storeId) q = q.eq("store_id", data.storeId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as GiftCard[];
  });
