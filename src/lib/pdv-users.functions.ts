import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSystemUsers = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Get roles and store info
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select(`
        user_id,
        display_name,
        login_email,
        role,
        active,
        stores ( name )
      `)
      .order("role");

    if (rolesError) throw rolesError;

    // Auth Admin API is optional here: if it is unreachable we still return roles.
    let users: Array<{ id: string; email?: string; last_sign_in_at?: string | null }> = [];
    try {
      const res = await supabaseAdmin.auth.admin.listUsers();
      if (!res.error) users = res.data.users as typeof users;
    } catch (e) {
      console.warn("[pdv-users] listUsers indisponível:", e);
    }

    return (roles ?? []).map((r) => {
      const authUser = users.find((u) => u.id === r.user_id);
      return {
        ...r,
        auth_email: authUser?.email ?? r.login_email,
        last_sign_in: authUser?.last_sign_in_at ?? null,
      };
    });
  });

export const getKatarineDebugInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Tentativa direta de obter dados da Katarine no Auth
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("*")
      .eq("login_email", "katarine@ks.local.br")
      .maybeSingle();

    if (!roles) return { error: "Katarine não encontrada no banco (user_roles)" };

    try {
      const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(roles.user_id);
      if (error) throw error;
      
      // Retornamos metadados do Auth, mas note que a senha (PIN) NÃO é acessível via API do Supabase
      // O campo 'encrypted_password' não é retornado pelo SDK admin.
      return {
        role_data: roles,
        auth_user: user,
        note: "O Supabase não permite recuperar a senha/PIN original via API por segurança. Use a função de redefinir PIN no painel de Usuários."
      };
    } catch (e: any) {
      return { 
        role_data: roles, 
        auth_error: e.message || "Erro ao acessar Auth API",
        note: "O usuário existe no banco mas pode estar ausente ou inacessível no serviço de Autenticação."
      };
    }
  });
