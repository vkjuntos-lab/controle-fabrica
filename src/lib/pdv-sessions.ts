import { supabase } from "@/integrations/supabase/client";
import type { PaymentMethod, Session } from "./pdv-store";
import { logAudit } from "./pdv-audit";

type AnyClient = { from: (t: string) => any };
const db = supabase as unknown as AnyClient;

export type DbSession = {
  id: string;
  code: string;
  operator: string;
  opening: number;
  opened_at: string;
  closed_at: string | null;
  closing_counted: Record<PaymentMethod, number> | null;
  store_id: string;
  operator_user_id: string | null;
};

export function toStoreSession(row: DbSession): Session {
  return {
    id: row.id,
    openedAt: row.opened_at,
    operator: row.operator,
    opening: Number(row.opening),
    closedAt: row.closed_at ?? undefined,
    closingCounted: row.closing_counted ?? undefined,
  };
}

/**
 * Sessão aberta do usuário logado (RLS já limita ao dono ou à loja do gerente).
 */
export async function fetchOpenSessionForUser(operatorUserId: string): Promise<DbSession | null> {
  const { data, error } = await db
    .from("cashier_sessions")
    .select("id, code, operator, opening, opened_at, closed_at, closing_counted, store_id, operator_user_id")
    .eq("operator_user_id", operatorUserId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DbSession | null) ?? null;
}

export async function openSession(input: {
  storeId: string;
  operatorUserId: string;
  operatorName: string;
  opening: number;
}): Promise<DbSession> {
  const code = "S" + Date.now().toString().slice(-6);
  const { data, error } = await db
    .from("cashier_sessions")
    .insert({
      code,
      store_id: input.storeId,
      operator_user_id: input.operatorUserId,
      operator: input.operatorName,
      opening: input.opening,
    })
    .select("id, code, operator, opening, opened_at, closed_at, closing_counted, store_id, operator_user_id")
    .single();
  if (error) throw error;
  const row = data as DbSession;
  void logAudit("cashier.open", {
    entity: "cashier_session",
    entityId: row.id,
    storeId: row.store_id,
    details: { opening: row.opening, code: row.code },
  });
  return row;
}

export async function closeSession(input: {
  id: string;
  counted: Record<PaymentMethod, number>;
}) {
  const { error } = await db
    .from("cashier_sessions")
    .update({
      closed_at: new Date().toISOString(),
      closing_counted: input.counted,
    })
    .eq("id", input.id);
  if (error) throw error;
  void logAudit("cashier.close", {
    entity: "cashier_session",
    entityId: input.id,
    details: { counted: input.counted },
  });
}
