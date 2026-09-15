// CRUD + teste de gateways de pagamento por loja.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerEnum = z.enum(["mercadopago", "asaas", "pagbank", "pagarme"]);

async function assertManager(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  if (!isAdmin && !isManager) throw new Error("Apenas gerente ou administrador podem editar gateways.");
}

export type GatewayRow = {
  id: string;
  store_id: string;
  provider: "mercadopago" | "asaas" | "pagbank" | "pagarme";
  config: Record<string, any>;
  is_default: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/* ---------------- LIST ---------------- */
export const listGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { data: rows, error } = await supabase
      .from("payment_gateways")
      .select("*")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as GatewayRow[];
  });

/* ---------------- UPSERT ---------------- */
const upsertSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid(),
  provider: providerEnum,
  sandbox: z.boolean().default(false),
  config: z.record(z.string(), z.any()).default({}),
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export const upsertGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof upsertSchema>) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    await assertManager(supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const merged = { ...data.config, sandbox: data.sandbox };
    const payload: any = {
      store_id: data.storeId,
      provider: data.provider,
      config: merged,
      active: data.active,
      is_default: data.isDefault,
      updated_at: new Date().toISOString(),
    };

    // Se marcar como default, desmarcar os demais da loja
    if (data.isDefault) {
      await admin.from("payment_gateways")
        .update({ is_default: false })
        .eq("store_id", data.storeId);
    }

    let resId = data.id ?? null;
    if (resId) {
      const { error } = await admin.from("payment_gateways").update(payload).eq("id", resId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await admin.from("payment_gateways").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      resId = ins.id;
    }
    return { ok: true, id: resId };
  });

/* ---------------- SET DEFAULT ---------------- */
export const setDefaultGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; storeId: string }) =>
    z.object({ id: z.string().uuid(), storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager((context as any).supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await admin.from("payment_gateways").update({ is_default: false }).eq("store_id", data.storeId);
    const { error } = await admin.from("payment_gateways").update({ is_default: true, active: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- TOGGLE ACTIVE ---------------- */
export const toggleGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager((context as any).supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const patch: any = { active: data.active };
    if (!data.active) patch.is_default = false;
    const { error } = await admin.from("payment_gateways").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- DELETE ---------------- */
export const deleteGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager((context as any).supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("payment_gateways").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- TEST (ping) ---------------- */
export const testGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager((context as any).supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("payment_gateways").select("*").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Error("Gateway não encontrado.");

    const { buildDriver } = await import("@/lib/gateways/registry.server");
    try {
      const driver = buildDriver({
        storeId: row.store_id, provider: row.provider,
        sandbox: !!row.config?.sandbox, config: row.config ?? {},
      });
      const res = await driver.ping();
      return res;
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
