// Onda J — server fn para acionar reconciliação manualmente na UI.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertManager(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  if (!isAdmin && !isManager) throw new Error("Apenas gerente ou administrador podem reconciliar pagamentos.");
}

const schema = z.object({
  storeId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const runReconcileNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof schema>) => schema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    await assertManager(supabase, (context as any).userId);
    const { runReconciliation } = await import("@/lib/gateways/reconcile.server");
    const summary = await runReconciliation({
      storeId: data.storeId ?? null,
      limit: data.limit ?? 200,
    });
    return summary;
  });
