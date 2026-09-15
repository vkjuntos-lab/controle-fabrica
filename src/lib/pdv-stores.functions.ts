import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error("Falha ao verificar permissão: " + error.message);
  if (!data) throw new Error("Acesso restrito ao administrador.");
}

async function audit(
  supabase: any,
  action: string,
  opts: { entity?: string; entityId?: string; storeId?: string | null; details?: Record<string, unknown> } = {},
) {
  try {
    await supabase.rpc("log_audit", {
      _action: action,
      _entity: opts.entity ?? null,
      _entity_id: opts.entityId ?? null,
      _store_id: opts.storeId ?? null,
      _details: opts.details ?? {},
    });
  } catch (e) {
    console.warn("[audit-store]", action, e);
  }
}

/* ============================================================
 * CREATE STORE
 * ============================================================ */
const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, "Código: letras, números, _ ou -"),
  cnpj: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
});

export const createStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => createStoreSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("stores")
      .insert({
        name: data.name,
        code: data.code.toUpperCase(),
        cnpj: data.cnpj || null,
        address: data.address || null,
        phone: data.phone || null,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error("Falha ao criar loja: " + error.message);
    await audit(context.supabase, "store.create", {
      entity: "stores",
      entityId: created.id,
      storeId: created.id,
      details: { name: data.name, code: data.code },
    });
    return { ok: true as const, id: created.id };
  });

/* ============================================================
 * UPDATE STORE
 * ============================================================ */
const updateStoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  cnpj: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
});

export const updateStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => updateStoreSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        name: data.name,
        cnpj: data.cnpj || null,
        address: data.address || null,
        phone: data.phone || null,
      })
      .eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar loja: " + error.message);
    await audit(context.supabase, "store.update", {
      entity: "stores", entityId: data.id, storeId: data.id,
      details: { name: data.name },
    });
    return { ok: true as const };
  });

/* ============================================================
 * TOGGLE ACTIVE
 * ============================================================ */
const toggleStoreSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export const setStoreActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => toggleStoreSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar loja: " + error.message);
    await audit(context.supabase, data.active ? "store.activate" : "store.deactivate", {
      entity: "stores", entityId: data.id, storeId: data.id,
    });
    return { ok: true as const };
  });

/* ============================================================
 * LINK OPERATOR TO ANOTHER STORE
 *   Cria uma nova user_roles reutilizando o mesmo user_id/login_email
 * ============================================================ */
const linkSchema = z.object({
  userId: z.string().uuid(),
  storeId: z.string().uuid(),
  role: z.enum(["manager", "cashier", "stockist"]),
});

export const linkOperatorToStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => linkSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Busca um papel existente do usuário para reutilizar display_name/login_email
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("user_roles")
      .select("display_name, login_email")
      .eq("user_id", data.userId)
      .limit(1)
      .maybeSingle();
    if (exErr) throw new Error("Falha ao ler operador: " + exErr.message);
    if (!existing) throw new Error("Operador não encontrado.");

    // Evita duplicidade exata (mesma loja + mesmo role)
    const { data: dup } = await supabaseAdmin
      .from("user_roles")
      .select("id, active")
      .eq("user_id", data.userId)
      .eq("store_id", data.storeId)
      .eq("role", data.role)
      .maybeSingle();
    if (dup) {
      if (!dup.active) {
        await supabaseAdmin.from("user_roles").update({ active: true }).eq("id", dup.id);
      }
      await audit(context.supabase, "user.relink", {
        entity: "user_roles", entityId: dup.id, storeId: data.storeId,
      });
      return { ok: true as const, reused: true };
    }

    const { data: created, error } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.userId,
      role: data.role,
      store_id: data.storeId,
      display_name: existing.display_name,
      login_email: existing.login_email,
      active: true,
    }).select("id").single();
    if (error) throw new Error("Falha ao vincular: " + error.message);

    await audit(context.supabase, "user.link_store", {
      entity: "user_roles", entityId: created.id, storeId: data.storeId,
      details: { role: data.role },
    });
    return { ok: true as const, id: created.id };
  });
