// Onda 4 — Templates Meta: server functions para listar/sincronizar.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchMetaTemplates } from "./wa-templates.server";

type AnyClient = { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

async function assertManager(supabase: AnyClient, userId: string) {
  const [{ data: isAdmin }, { data: isMgr }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  if (!isAdmin && !isMgr) throw new Error("forbidden");
}

export const listWaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id?: string | null }) =>
    z.object({ store_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const userId = (context as any).userId as string;
    await assertManager(supabase, userId);
    let q = supabase.from("wa_templates").select("*").order("name", { ascending: true });
    if (data.store_id) q = q.eq("store_id", data.store_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const syncWaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const userId = (context as any).userId as string;
    await assertManager(supabase, userId);

    const { data: settings, error: sErr } = await supabase
      .from("wa_settings")
      .select("cloud_token, cloud_waba_id, provider")
      .eq("store_id", data.store_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settings?.cloud_token || !settings?.cloud_waba_id) {
      throw new Error("Configure Token e WABA ID (Cloud API) da loja antes de sincronizar.");
    }

    const templates = await fetchMetaTemplates({
      wabaId: settings.cloud_waba_id,
      token: settings.cloud_token,
    });

    let upserts = 0;
    for (const t of templates) {
      const { error } = await supabase.from("wa_templates").upsert(
        {
          store_id: data.store_id,
          meta_template_id: t.meta_template_id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          header_text: t.header_text,
          body_text: t.body_text,
          footer_text: t.footer_text,
          buttons: t.buttons,
          variables_count: t.variables_count,
          raw: t.raw as any,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "store_id,name,language" },
      );
      if (!error) upserts += 1;
    }
    return { synced: upserts, total: templates.length };
  });

export const deleteWaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const userId = (context as any).userId as string;
    await assertManager(supabase, userId);
    const { error } = await supabase.from("wa_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveWaWabaId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string; waba_id: string | null }) =>
    z.object({ store_id: z.string().uuid(), waba_id: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const userId = (context as any).userId as string;
    await assertManager(supabase, userId);
    const { error } = await supabase
      .from("wa_settings")
      .update({ cloud_waba_id: data.waba_id })
      .eq("store_id", data.store_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWaWabaId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const userId = (context as any).userId as string;
    await assertManager(supabase, userId);
    const { data: row } = await supabase
      .from("wa_settings")
      .select("cloud_waba_id")
      .eq("store_id", data.store_id)
      .maybeSingle();
    return { waba_id: row?.cloud_waba_id ?? null };
  });

/**
 * Valida se existe um template APPROVED com (name + language) na loja.
 * Retorna { ok, reason, available_languages } — usado antes de enviar.
 */
export const validateWaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string; name: string; language: string }) =>
    z.object({
      store_id: z.string().uuid(),
      name: z.string().min(1),
      language: z.string().min(2),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: rows, error } = await supabase
      .from("wa_templates")
      .select("name,language,status")
      .eq("store_id", data.store_id)
      .eq("name", data.name);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ name: string; language: string; status: string }>;
    if (list.length === 0) {
      return { ok: false, reason: "template_not_found" as const, available_languages: [] as string[] };
    }
    const match = list.find((r) => r.language === data.language);
    if (!match) {
      return {
        ok: false,
        reason: "language_not_found" as const,
        available_languages: list.map((r) => r.language),
      };
    }
    if ((match.status ?? "").toUpperCase() !== "APPROVED") {
      return { ok: false, reason: "not_approved" as const, status: match.status, available_languages: [match.language] };
    }
    return { ok: true as const, available_languages: list.map((r) => r.language) };
  });
