import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pinToPassword } from "./pdv-pin";

/**
 * Server functions administrativas.
 * Todas exigem que o chamador esteja autenticado E tenha papel 'admin'
 * (verificado via public.is_admin RPC executado com a sessão do usuário).
 */

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error("Falha ao verificar permissão: " + error.message);
  if (!data) throw new Error("Acesso restrito ao administrador.");
}

/* ============================================================
 * Criar operador (gerente ou caixa) com PIN
 *   - PIN vira senha; email técnico é gerado internamente
 *   - Requer papel admin
 * ============================================================ */
const createOperatorSchema = z.object({
  storeId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(60),
  role: z.enum(["manager", "cashier", "stockist"]),
  pin: z.string().regex(/^\d{6,12}$/, "PIN precisa ter 6 a 12 dígitos"),
});

async function auditFromCaller(
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
    console.warn("[audit-server]", action, e);
  }
}

export const createOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => createOperatorSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica loja
    const { data: store, error: storeErr } = await supabaseAdmin
      .from("stores")
      .select("id, name")
      .eq("id", data.storeId)
      .maybeSingle();
    if (storeErr) throw new Error("Falha ao ler loja: " + storeErr.message);
    if (!store) throw new Error("Loja não encontrada.");

    // Cria o auth user
    const loginEmail = `op-${crypto.randomUUID()}@ksmultimake.local`;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: pinToPassword(data.pin),
      email_confirm: true,
      user_metadata: { display_name: data.displayName, role: data.role, store_id: data.storeId },
    });
    if (createErr) throw new Error("Falha ao criar usuário: " + createErr.message);
    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("Usuário não foi criado.");

    // Cria o papel
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role: data.role,
      store_id: data.storeId,
      display_name: data.displayName,
      login_email: loginEmail,
      active: true,
    });
    if (roleErr) {
      // rollback do auth user para não deixar órfão
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error("Falha ao criar papel: " + roleErr.message);
    }

    await auditFromCaller(context.supabase, "user.create", {
      entity: "user_roles",
      entityId: newUserId,
      storeId: data.storeId,
      details: { role: data.role, name: data.displayName },
    });

    return { ok: true as const, userId: newUserId, loginEmail };
  });

/* ============================================================
 * Redefinir PIN de um operador
 * ============================================================ */
const resetPinSchema = z.object({
  userId: z.string().uuid(),
  pin: z.string().regex(/^\d{6,12}$/, "PIN precisa ter 6 a 12 dígitos"),
});

export const resetOperatorPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => resetPinSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Tenta obter o usuário primeiro para garantir que ele existe e evitar erros genéricos {}
    // Nota: Usamos getRoleById ou similar se quisermos garantir que o admin tem direito sobre este usuário específico.
    // Mas assertAdmin já garante que o chamador é um administrador global.
    
    try {
      // 1. Tenta encontrar o usuário no auth.users via admin API
      let { data: { user: targetUser }, error: getUserErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      
      // Se não encontrar no auth, mas o usuário quer redefinir o PIN de alguém que está no banco (user_roles)
      if (getUserErr || !targetUser) {
        console.warn(`[resetOperatorPin] Usuário ${data.userId} não encontrado no Auth. Tentando recriar...`);
        
        // Busca os dados necessários na user_roles para restaurar o usuário no Auth
        const { data: roleData, error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .select("login_email, display_name, role, store_id")
          .eq("user_id", data.userId)
          .maybeSingle();

        if (roleErr || !roleData) {
          throw new Error("Usuário não encontrado no banco de dados (user_roles).");
        }

        if (!roleData.login_email) {
          throw new Error("Usuário não possui e-mail de login vinculado para restauração.");
        }

        // Recria o usuário no Auth com o novo PIN fornecido
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          id: data.userId, // Tenta manter o mesmo UUID
          email: roleData.login_email,
          password: pinToPassword(data.pin),
          email_confirm: true,
          user_metadata: { 
            display_name: roleData.display_name, 
            role: roleData.role, 
            store_id: roleData.store_id 
          },
        });

        if (createErr) {
          console.error("[resetOperatorPin] Erro ao recriar usuário:", createErr);
          // O erro createErr pode vir como objeto, garantimos que pegamos a mensagem
          const msg = typeof createErr === 'object' ? (createErr.message || JSON.stringify(createErr)) : String(createErr);
          throw new Error(`Falha ao restaurar conta de acesso: ${msg}`);
        }
        
        targetUser = created.user;
      } else {
        // 2. Se o usuário já existia, apenas atualiza a senha (PIN)
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
          password: pinToPassword(data.pin),
        });

        if (updateErr) {
          console.error("[resetOperatorPin] Erro ao atualizar PIN:", updateErr);
          const msg = typeof updateErr === 'object' ? (updateErr.message || JSON.stringify(updateErr)) : String(updateErr);
          throw new Error(`Erro ao atualizar PIN no Auth: ${msg}`);
        }
      }

      await auditFromCaller(context.supabase, "user.reset_pin", {
        entity: "auth.users",
        entityId: data.userId,
        details: {
          reason: "Solicitação administrativa para redefinir PIN/Senha",
          timestamp: new Date().toISOString(),
          admin_user_id: context.userId,
          target_user_id: data.userId,
          target_email: targetUser?.email || "unknown",
          action_type: "SECURITY_CREDENTIAL_CHANGE"
        }
      });
      return { ok: true as const };
    } catch (err: any) {
      console.error("[resetOperatorPin] Catch block:", err);
      // Garante que o erro retornado para o client-side seja uma string legível, não {}
      const errorMessage = err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));
      throw new Error(errorMessage === "{}" ? "Erro desconhecido no servidor (Auth API)" : errorMessage);
    }
  });

/* ============================================================
 * Ativar/desativar operador
 * ============================================================ */
const toggleSchema = z.object({
  roleRowId: z.string().uuid(),
  active: z.boolean(),
});

export const setOperatorActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => toggleSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ active: data.active })
      .eq("id", data.roleRowId);
    if (error) throw new Error("Falha ao atualizar: " + error.message);
    await auditFromCaller(context.supabase, data.active ? "user.activate" : "user.deactivate", {
      entity: "user_roles", entityId: data.roleRowId,
    });
    return { ok: true as const };
  });

/* ============================================================
 * Excluir operador (auth user + user_roles em cascata)
 * ============================================================ */
const deleteSchema = z.object({
  userId: z.string().uuid(),
});

export const deleteOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => deleteSchema.parse(raw))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir a si mesmo.");
    }
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("Falha ao excluir: " + error.message);
    await auditFromCaller(context.supabase, "user.delete", {
      entity: "user", entityId: data.userId,
    });
    return { ok: true as const };
  });
