import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_ROLES } from "@/lib/rbac";

const roleSchema = z.enum(APP_ROLES);

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
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
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
