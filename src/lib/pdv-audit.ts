import { supabase } from "@/integrations/supabase/client";

/**
 * Registra evento de auditoria via RPC public.log_audit.
 * Nunca lança — falhas de auditoria não devem quebrar o fluxo do usuário.
 */
export async function logAudit(
  action: string,
  opts: {
    entity?: string;
    entityId?: string;
    storeId?: string | null;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_audit" as never, {
      _action: action,
      _entity: opts.entity ?? null,
      _entity_id: opts.entityId ?? null,
      _store_id: opts.storeId ?? null,
      _details: (opts.details ?? {}) as never,
    } as never);
    if (error) console.warn("[audit]", action, error.message);
  } catch (e) {
    console.warn("[audit] falha inesperada", action, e);
  }
}

export type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  store_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

/**
 * Lista os últimos eventos visíveis para o usuário (RLS aplica).
 */
export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("audit_log" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AuditRow[];
}
