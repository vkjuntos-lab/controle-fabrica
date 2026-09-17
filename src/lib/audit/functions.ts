import type { Json } from "@/integrations/supabase/types";

/**
 * Registra um evento de auditoria no banco usando o cliente de service role
 * (escrita confiável server-side, sem depender de RLS). Uso exclusivo em
 * handlers de servidor (rotas de API, crons, webhooks).
 */
export async function writeSystemAudit({
  action,
  resource,
  resourceId,
  result = "success",
  context = {},
  organizationId,
  userId,
}: {
  action: string;
  resource: string;
  resourceId?: string | null;
  result?: string;
  context?: Record<string, unknown>;
  organizationId?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_log").insert({
      organization_id: organizationId ?? null,
      user_id: userId ?? null,
      action,
      resource,
      resource_id: resourceId ?? null,
      result,
      context: (context ?? {}) as Json,
    });
    if (error) {
      console.error(`[audit] falha ao registrar ${action}:`, error.message);
    }
  } catch (error) {
    console.error(`[audit] falha ao registrar ${action}:`, error);
  }
}