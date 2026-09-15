// Security audit log — registro manual de eventos sensíveis (mudança de RLS,
// rotação de segredos de webhook/cron). Persistido em public.audit_log via RPC
// log_audit para reaproveitar RLS/UI existente.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KIND_TO_ACTION = {
  rls_change: "security.rls_change",
  webhook_secret_rotation: "security.webhook_secret_rotation",
  cron_secret_rotation: "security.cron_secret_rotation",
  policy_review: "security.policy_review",
  other: "security.event",
} as const;

const schema = z.object({
  kind: z.enum([
    "rls_change",
    "webhook_secret_rotation",
    "cron_secret_rotation",
    "policy_review",
    "other",
  ]),
  entity: z.string().max(120).nullable().optional(),
  entity_id: z.string().max(120).nullable().optional(),
  store_id: z.string().uuid().nullable().optional(),
  summary: z.string().min(3).max(240),
  details: z.record(z.string(), z.unknown()).optional(),
});

async function assertAdminOrManager(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  if (!isAdmin && !isManager) {
    throw new Error("Apenas administradores ou gerentes podem registrar eventos de segurança.");
  }
}

export const logSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId as string;
    await assertAdminOrManager(supabase, userId);

    const action = KIND_TO_ACTION[data.kind];
    const details = {
      summary: data.summary,
      kind: data.kind,
      ...(data.details ?? {}),
    };
    const { error } = await supabase.rpc("log_audit" as never, {
      _action: action,
      _entity: data.entity ?? null,
      _entity_id: data.entity_id ?? null,
      _store_id: data.store_id ?? null,
      _details: details as never,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, action };
  });
