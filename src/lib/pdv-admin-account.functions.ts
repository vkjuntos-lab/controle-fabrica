// Server functions para gestão da conta administradora:
//  - Convite / criação de novo admin (protegido: só admin logado)
//  - Solicitação de redefinição de senha do admin (público, mas só envia
//    email quando o endereço realmente pertence a um admin ativo)
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
  opts: { entity?: string; entityId?: string; details?: Record<string, unknown> } = {},
) {
  try {
    await supabase.rpc("log_audit", {
      _action: action,
      _entity: opts.entity ?? null,
      _entity_id: opts.entityId ?? null,
      _store_id: null,
      _details: opts.details ?? {},
    });
  } catch (e) {
    console.warn("[audit-admin-account]", action, e);
  }
}

/* ============================================================
 * inviteAdmin — cria um novo administrador e envia convite por e-mail
 *   - Somente admin autenticado pode chamar
 *   - Se o e-mail já existe: retorna erro
 *   - Envia link de convite (Supabase Auth) para a URL de redefinição
 * ============================================================ */
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(180),
  displayName: z.string().trim().min(2).max(80),
  redirectTo: z.string().url().max(400),
});

export const inviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => inviteSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica se já existe um usuário auth com este e-mail (via user_roles)
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id, user_id, role, active")
      .eq("login_email", data.email)
      .maybeSingle();
    if (existing) {
      throw new Error("Já existe um usuário com este e-mail.");
    }

    // inviteUserByEmail dispara o e-mail de convite do Supabase Auth
    const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      {
        redirectTo: data.redirectTo,
        data: { display_name: data.displayName, role: "admin" },
      },
    );
    if (invErr) throw new Error("Falha ao enviar convite: " + invErr.message);
    const newUserId = invited.user?.id;
    if (!newUserId) throw new Error("Convite não retornou usuário.");

    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role: "admin",
      store_id: null,
      display_name: data.displayName,
      login_email: data.email,
      active: true,
    });
    if (roleErr) {
      // rollback
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error("Falha ao vincular papel de admin: " + roleErr.message);
    }

    await audit(context.supabase, "admin.invite", {
      entity: "user_roles",
      entityId: newUserId,
      details: { email: data.email, name: data.displayName },
    });

    return { ok: true as const, userId: newUserId, email: data.email };
  });

/* ============================================================
 * requestAdminPasswordReset — envia e-mail de recuperação
 *   - Público (sem auth) para permitir "esqueci a senha"
 *   - Só envia se o e-mail for de um admin ativo (evita abuso)
 *   - Retorna sempre { ok: true } para não expor existência
 * ============================================================ */
const resetSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(180),
  redirectTo: z.string().url().max(400),
});

export const requestAdminPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((raw) => resetSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // valida se há um admin ATIVO com esse e-mail
    const { data: row } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, active")
      .eq("login_email", data.email)
      .eq("role", "admin")
      .eq("active", true)
      .maybeSingle();

    if (!row) {
      // resposta genérica — não vaza existência
      return { ok: true as const };
    }

    // Gera link de recuperação; Supabase envia o e-mail automaticamente
    // se hook de email estiver configurado. Como fallback também usamos
    // resetPasswordForEmail no client. Aqui usamos generateLink para
    // acionar o fluxo transacional gerenciado.
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
      options: { redirectTo: data.redirectTo },
    });
    if (error) {
      console.warn("[admin.reset] generateLink falhou:", error.message);
    }

    // Audit: registra que houve pedido (sem revelar ao cliente)
    try {
      await (supabaseAdmin.from("audit_log") as any).insert({
        user_id: row.user_id,
        action: "admin.password_reset_requested",
        entity: "user",
        entity_id: row.user_id,
        details: { email: data.email },
      });
    } catch (e) {
      console.warn("[audit-admin-reset]", e);
    }

    return { ok: true as const };
  });
