import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { APP_ROLES, PERMISSIONS, type Permission } from "@/lib/rbac";

const roleSchema = z.enum(APP_ROLES);

/**
 * Checagem de permissão server-side (defesa em profundidade).
 * RLS já impõe a política; aqui garantimos que a permissão declarada existe,
 * mesmo que uma política futura fique mais permissiva.
 */
async function requireOrgPermission(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  permission: Permission,
  userId: string,
): Promise<void> {
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    _organization_id: organizationId,
    _permission: permission,
    _user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (!allowed) throw new Error("Sem permissão para esta operação.");
}

/** Organizações do usuário autenticado, com o papel dele em cada uma. */
export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_organizations");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        document: z.string().trim().max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const baseSlug =
      data.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40) || "organizacao";
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: org, error } = await context.supabase
      .from("organizations")
      .insert({
        name: data.name,
        slug,
        document: data.document ?? null,
        created_by: context.userId,
      })
      .select("id, name, slug")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: org.id,
      user_id: context.userId,
      action: "organization.create",
      resource: "organizations",
      resource_id: org.id,
    });

    return org;
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().trim().min(2).max(120),
        document: z.string().trim().max(32).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.organizationManage,
      context.userId,
    );

    const { error } = await context.supabase
      .from("organizations")
      .update({ name: data.name, document: data.document ?? null })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "organization.update",
      resource: "organizations",
      resource_id: data.organizationId,
    });
    return { ok: true };
  });

export const getOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .select("id, name, slug, document, created_at")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return org;
  });

/** Participantes da organização + dados de perfil (nome/e-mail). */
export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.usersRead,
      context.userId,
    );

    const { data: members, error } = await context.supabase
      .from("organization_members")
      .select("id, user_id, role, is_active, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!members?.length) return [];

    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .in(
        "id",
        members.map((m) => m.user_id),
      );

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return members.map((m) => ({
      ...m,
      full_name: byId.get(m.user_id)?.full_name ?? null,
      email: byId.get(m.user_id)?.email ?? null,
      is_self: m.user_id === context.userId,
    }));
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        role: roleSchema.optional(),
        isActive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.usersManage,
      context.userId,
    );

    const patch: { role?: z.infer<typeof roleSchema>; is_active?: boolean } = {};
    if (data.role) patch.role = data.role;
    if (typeof data.isActive === "boolean") patch.is_active = data.isActive;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await context.supabase
      .from("organization_members")
      .update(patch)
      .eq("id", data.memberId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "member.update",
      resource: "organization_members",
      resource_id: data.memberId,
      context: patch,
    });
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), memberId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.usersManage,
      context.userId,
    );

    const { error } = await context.supabase
      .from("organization_members")
      .delete()
      .eq("id", data.memberId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "member.remove",
      resource: "organization_members",
      resource_id: data.memberId,
    });
    return { ok: true };
  });

/**
 * Adiciona à organização alguém que JÁ possui conta na plataforma.
 * Não envia convite por e-mail (envio de e-mail ainda não configurado).
 */
export const addExistingUserAsMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        email: z.string().trim().email(),
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("has_org_role", {
      _organization_id: data.organizationId,
      _roles: ["admin", "gestor"],
    });
    if (roleError) throw new Error(roleError.message);
    if (!allowed) throw new Error("Sem permissão para gerenciar participantes.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    // Procura a conta pelo e-mail entre os usuários existentes.
    let userId: string | null = null;
    for (let page = 1; page <= 10 && !userId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      userId = list.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      if (list.users.length < 200) break;
    }
    if (!userId) {
      return {
        ok: false as const,
        reason: "user_not_found" as const,
      };
    }

    const { error } = await context.supabase
      .from("organization_members")
      .insert({ organization_id: data.organizationId, user_id: userId, role: data.role });
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "member.add",
      resource: "organization_members",
      context: { email, role: data.role },
    });

    return { ok: true as const };
  });

export const listRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("role_permissions")
      .select("role, permission")
      .order("role", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export type AuditLogRow = {
  id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  result: string;
  context: Json | null;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
};

/**
 * Registros de auditoria da organização (admin/gestor). Consulta paginada com
 * busca textual em ação/recurso/resultado e opção de filtrar por ação.
 */
export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        query: z.string().trim().max(120).optional(),
        action: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.auditRead,
      context.userId,
    );

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let builder = context.supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.query) {
      const like = `%${data.query}%`;
      builder = builder.or(`action.ilike.${like},resource.ilike.${like},result.ilike.${like}`);
    }
    if (data.action) {
      builder = builder.eq("action", data.action);
    }

    const { data: rows, count, error } = await builder;
    if (error) throw new Error(error.message);

    const entries: AuditLogRow[] = (rows ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      resource: row.resource,
      resource_id: row.resource_id,
      result: row.result,
      context: row.context,
      created_at: row.created_at,
      user_id: row.user_id,
      user_name: null,
      user_email: null,
    }));

    const userIds = [
      ...new Set(entries.map((e) => e.user_id).filter((id): id is string => Boolean(id))),
    ];

    if (userIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      for (const entry of entries) {
        entry.user_name = entry.user_id ? (byId.get(entry.user_id)?.full_name ?? null) : null;
        entry.user_email = entry.user_id ? (byId.get(entry.user_id)?.email ?? null) : null;
      }
    }

    const maxPage = Math.max(1, Math.ceil((count ?? 0) / data.pageSize));
    return { rows: entries, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

/** Ações distintas já registradas na auditoria, para popular o filtro. */
export const listAuditActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.auditRead,
      context.userId,
    );

    const { data: rows, error } = await context.supabase
      .from("audit_log")
      .select("action")
      .eq("organization_id", data.organizationId)
      .limit(1000);
    if (error) throw new Error(error.message);

    const actions = [...new Set((rows ?? []).map((r) => r.action))].sort();
    return actions;
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fullName: z.string().trim().max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName || null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Define o avatar do usuário a partir do caminho no bucket `avatars`. */
export const setMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().trim().min(1).max(512) }).parse(input))
  .handler(async ({ data, context }) => {
    const path = data.path;
    if (!path.startsWith(`${context.userId}/`)) {
      throw new Error("Caminho de avatar inválido.");
    }

    const { data: url } = context.supabase.storage.from("avatars").getPublicUrl(path);
    if (!url?.publicUrl) throw new Error("Arquivo não encontrado.");

    const { error: updateError } = await context.supabase
      .from("profiles")
      .update({ avatar_url: url.publicUrl })
      .eq("id", context.userId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true };
  });

/** Remove o avatar do perfil e apaga o arquivo no bucket, se existir. */
export const removeMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    if (profile?.avatar_url?.includes("/object/public/avatars/")) {
      const [, pathRaw] = profile.avatar_url.split("/object/public/avatars/");
      const filePath = (pathRaw ?? "").split("?")[0];
      if (filePath.startsWith(`${context.userId}/`)) {
        await context.supabase.storage.from("avatars").remove([filePath]);
      }
    }

    const { error } = await context.supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** Convida alguém por link. O token é gerado no servidor e expira em 7 dias. */
export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email(),
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.usersManage,
      context.userId,
    );

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error } = await context.supabase
      .from("invitations")
      .insert({
        organization_id: data.organizationId,
        email: data.email,
        role: data.role,
        token,
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "member.invite",
      resource: "invitations",
      resource_id: inserted.id,
      context: { email: data.email, role: data.role },
    });

    return { ok: true, token: inserted.token };
  });

/** Convites pendentes da organização (para o gestor compartilhar/revogar). */
export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.usersRead,
      context.userId,
    );
    const { data: rows, error } = await context.supabase
      .from("invitations")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Revoga um convite pendente. */
export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), invitationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.usersManage,
      context.userId,
    );

    const { error } = await context.supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", data.invitationId)
      .eq("organization_id", data.organizationId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "invitation.revoke",
      resource: "invitations",
      resource_id: data.invitationId,
    });
    return { ok: true };
  });

/** Informações de um convite pelo token, para a pessoa logada confirmar o aceite. */
export const getInvitationByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invitation, error } = await supabaseAdmin
      .from("invitations")
      .select(
        "id, email, role, status, expires_at, organizations!inner(name, id)",
      )
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!invitation) throw new Error("Convite não encontrado.");
    if (invitation.status !== "pending") {
      throw new Error(invitation.status === "revoked" ? "Este convite foi revogado." : "Este convite já foi usado.");
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      throw new Error("Este convite expirou.");
    }

    const loggedEmail = (context.claims as { email?: string } | undefined)?.email?.toLowerCase();
    if (!loggedEmail) throw new Error("Conta sem e-mail associado.");

    const org = Array.isArray(invitation.organizations)
      ? invitation.organizations[0]
      : invitation.organizations;
    return {
      organizationId: org?.id ?? null,
      organizationName: org?.name ?? "—",
      email: invitation.email,
      role: invitation.role,
      inviteMatchesAccount: loggedEmail === invitation.email.toLowerCase(),
    };
  });

/** Aceita o convite, criando a associação do usuário à organização. */
export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invitation, error } = await supabaseAdmin
      .from("invitations")
      .select("id, organization_id, email, role, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invitation) throw new Error("Convite não encontrado.");
    if (invitation.status !== "pending") {
      throw new Error(invitation.status === "revoked" ? "Este convite foi revogado." : "Este convite já foi usado.");
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      throw new Error("Este convite expirou.");
    }

    const loggedEmail = (context.claims as { email?: string } | undefined)?.email?.toLowerCase();
    if (!loggedEmail || loggedEmail !== invitation.email.toLowerCase()) {
      throw new Error("Este convite é para outro e-mail. Entre com o e-mail convidado.");
    }

    const { data: existing, error: existingError } = await context.supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", invitation.organization_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) {
      const { error: insertError } = await context.supabase
        .from("organization_members")
        .insert({
          organization_id: invitation.organization_id,
          user_id: context.userId,
          role: invitation.role,
        });
      if (insertError) throw new Error(insertError.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from("invitations")
      .update({ status: "accepted", accepted_by: context.userId, accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);
    if (updateError) throw new Error(updateError.message);

    await context.supabase.from("audit_log").insert({
      organization_id: invitation.organization_id,
      user_id: context.userId,
      action: "member.invite_accept",
      resource: "invitations",
      resource_id: invitation.id,
    });

    return { ok: true, organizationId: invitation.organization_id };
  });
