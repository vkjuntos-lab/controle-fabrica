// Server functions do painel do Instagram Direct (Bella IA omnichannel).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type IgSettings = {
  store_id: string;
  ig_token: string | null;
  ig_user_id: string | null;
  ig_page_id: string | null;
  ig_app_id: string | null;
  ig_token_expires_at: string | null;
  ig_active: boolean;
  verified_at: string | null;
  last_test_error: string | null;
  last_test_at: string | null;
};

export const getIgSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) =>
    z.object({ storeId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<IgSettings> => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("wa_settings")
      .select("store_id, ig_token, ig_user_id, ig_page_id, ig_app_id, ig_token_expires_at, ig_active, verified_at, last_test_error, last_test_at")
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      store_id: data.storeId,
      ig_token: row?.ig_token ?? null,
      ig_user_id: row?.ig_user_id ?? null,
      ig_page_id: row?.ig_page_id ?? null,
      ig_app_id: row?.ig_app_id ?? null,
      ig_token_expires_at: row?.ig_token_expires_at ?? null,
      ig_active: !!row?.ig_active,
      verified_at: row?.verified_at ?? null,
      last_test_error: row?.last_test_error ?? null,
      last_test_at: row?.last_test_at ?? null,
    };
  });

export const saveIgSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    storeId: string;
    ig_token?: string | null;
    ig_user_id?: string | null;
    ig_page_id?: string | null;
    ig_app_id?: string | null;
    ig_active?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const patch: Record<string, unknown> = {
      store_id: data.storeId,
      ig_token: data.ig_token ?? null,
      ig_user_id: data.ig_user_id ?? null,
      ig_page_id: data.ig_page_id ?? null,
      ig_app_id: data.ig_app_id ?? null,
      ig_active: !!data.ig_active,
    };
    const { error } = await supabase
      .from("wa_settings")
      .upsert(patch, { onConflict: "store_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Testa envio real via Instagram Messaging. `to` = IGSID do destinatário. */
export const testIgSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; to: string; message?: string }) =>
    z.object({
      storeId: z.string().uuid(),
      to: z.string().min(3),
      message: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("wa_settings")
      .select("ig_token, ig_user_id, ig_page_id, ig_active")
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.ig_token || !row?.ig_user_id) {
      return { ok: false as const, error: "Credenciais do Instagram incompletas." };
    }
    const { sendInstagramMessage } = await import("@/lib/ig-driver.server");
    const res = await sendInstagramMessage(
      {
        ig_token: row.ig_token,
        ig_user_id: row.ig_user_id,
        ig_page_id: row.ig_page_id,
        ig_active: row.ig_active,
      },
      data.to,
      data.message ?? "🧪 Teste de conexão do Instagram Direct (Bella IA).",
    );
    await supabase
      .from("wa_settings")
      .update({
        last_test_at: new Date().toISOString(),
        last_test_error: res.ok ? null : res.error ?? "Erro desconhecido",
        verified_at: res.ok ? new Date().toISOString() : row ? (row as any).verified_at : null,
      })
      .eq("store_id", data.storeId);
    return res;
  });

/** Retorna o path do webhook + preview do verify token para colar no Meta. */
export const getIgWebhookInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = process.env.IG_WEBHOOK_VERIFY_TOKEN ?? "";
    const appSecret = process.env.META_APP_SECRET ?? "";
    const appId = process.env.META_APP_ID ?? "";
    const igAppId = process.env.IG_APP_ID ?? "";
    const igAppSecret = process.env.IG_APP_SECRET ?? "";
    return {
      webhook_path: "/api/public/ig-agent-webhook",
      oauth_callback_path: "/api/public/ig-oauth/callback",
      deauthorize_path: "/api/public/ig-oauth/deauthorize",
      data_deletion_path: "/api/public/ig-oauth/data-deletion",
      verify_token_set: !!token,
      verify_token_preview: token ? token.slice(0, 4) + "…" + token.slice(-2) : null,
      app_secret_set: !!appSecret || !!igAppSecret,
      app_id_set: !!appId || !!igAppId,
      oauth_ready: (!!appId || !!igAppId) && (!!appSecret || !!igAppSecret),
    };
  });

/** Gera a URL de autorização do Instagram Business Login para a loja atual. */
export const startIgOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; origin: string }) =>
    z.object({ storeId: z.string().uuid(), origin: z.string().url() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { signState, buildAuthorizeUrl, igAppId, igAppSecret } = await import("@/lib/ig-oauth.server");
    if (!igAppId() || !igAppSecret()) {
      return { ok: false as const, error: "Configure IG_APP_ID/IG_APP_SECRET (ou META_APP_ID/META_APP_SECRET)." };
    }
    const origin = data.origin.replace(/\/$/, "");
    const redirectUri = `${origin}/api/public/ig-oauth/callback`;
    const state = await signState(data.storeId);
    return { ok: true as const, url: buildAuthorizeUrl(redirectUri, state), redirectUri };
  });


/* ────────────────────────── Logs do webhook ────────────────────────── */

export const listIgWebhookLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId?: string | null; status?: string | null; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    let q = supabase
      .from("ig_webhook_logs")
      .select("id, created_at, direction, status, http_status, signature_valid, event_type, sender_id, recipient_id, error, request, response, store_id")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(data.limit ?? 100, 1), 500));
    if (data.storeId) q = q.or(`store_id.eq.${data.storeId},store_id.is.null`);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/* ────────────────────────── Renovação de token ────────────────────────── */

export const refreshIgToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) =>
    z.object({ storeId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("wa_settings")
      .select("ig_token, ig_app_id")
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.ig_token) return { ok: false as const, error: "Sem token para renovar." };

    const { refreshIgLongLivedToken } = await import("@/lib/ig-token.server");
    const res = await refreshIgLongLivedToken({
      token: row.ig_token,
      appId: (row.ig_app_id ?? process.env.META_APP_ID ?? "") as string,
      appSecret: process.env.META_APP_SECRET ?? "",
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    const expires_at = res.expiresIn
      ? new Date(Date.now() + res.expiresIn * 1000).toISOString()
      : null;
    const { error: upErr } = await supabase
      .from("wa_settings")
      .update({ ig_token: res.token, ig_token_expires_at: expires_at })
      .eq("store_id", data.storeId);
    if (upErr) return { ok: false as const, error: upErr.message };
    return { ok: true as const, expires_at };
  });

/* ────────────────────────── Templates de DM ────────────────────────── */

export const listIgTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase
      .from("ig_templates")
      .select("id, name, body, variables, created_at, updated_at")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const upsertIgTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; storeId: string; name: string; body: string; variables?: string[] }) =>
    z.object({
      id: z.string().uuid().optional(),
      storeId: z.string().uuid(),
      name: z.string().min(1).max(80),
      body: z.string().min(1).max(4000),
      variables: z.array(z.string()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const payload = {
      store_id: data.storeId,
      name: data.name,
      body: data.body,
      variables: data.variables ?? [],
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase.from("ig_templates").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("ig_templates").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteIgTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { error } = await supabase.from("ig_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Envia um template em massa para IGSIDs (ou usa audiência das conversas
 * existentes canal=instagram da loja — respeitando janela 24h do Meta).
 */
export const sendIgTemplateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    storeId: string;
    templateId: string;
    recipients?: string[]; // IGSIDs
    useConversations?: boolean; // usa wa_conversations canal=instagram
    variables?: Record<string, string>;
  }) =>
    z.object({
      storeId: z.string().uuid(),
      templateId: z.string().uuid(),
      recipients: z.array(z.string().min(1)).optional(),
      useConversations: z.boolean().optional(),
      variables: z.record(z.string(), z.string()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const [{ data: tpl, error: te }, { data: cfg, error: ce }] = await Promise.all([
      supabase.from("ig_templates").select("*").eq("id", data.templateId).maybeSingle(),
      supabase.from("wa_settings")
        .select("ig_token, ig_user_id, ig_page_id, ig_active")
        .eq("store_id", data.storeId).maybeSingle(),
    ]);
    if (te) throw new Error(te.message);
    if (ce) throw new Error(ce.message);
    if (!tpl) return { ok: false as const, error: "Template não encontrado." };
    if (!cfg?.ig_token || !cfg?.ig_user_id) return { ok: false as const, error: "Credenciais Instagram incompletas." };
    if (!cfg?.ig_active) return { ok: false as const, error: "Instagram desativado para esta loja." };

    let audience: string[] = [];
    if (data.recipients?.length) audience = [...new Set(data.recipients.map((s) => s.trim()).filter(Boolean))];
    if (data.useConversations) {
      const { data: convs } = await supabase
        .from("wa_conversations")
        .select("phone")
        .eq("store_id", data.storeId)
        .eq("channel", "instagram");
      const fromConvs = (convs ?? []).map((c: any) => c.phone).filter(Boolean);
      audience = [...new Set([...audience, ...fromConvs])];
    }
    if (!audience.length) return { ok: false as const, error: "Nenhum destinatário selecionado." };

    const vars = data.variables ?? {};
    const rendered = (tpl.body as string).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m: string, k: string) => vars[k] ?? "");
    if (!rendered.trim()) return { ok: false as const, error: "Template renderizado vazio." };

    const { sendInstagramMessage } = await import("@/lib/ig-driver.server");
    const { logIgWebhook } = await import("@/lib/ig-logs.server");
    let sent = 0, errs = 0;
    const errors: Array<{ to: string; error: string }> = [];
    for (const to of audience) {
      const res = await sendInstagramMessage(
        {
          ig_token: cfg.ig_token,
          ig_user_id: cfg.ig_user_id,
          ig_page_id: cfg.ig_page_id,
          ig_active: cfg.ig_active,
        },
        to,
        rendered,
      );
      if (res.ok) sent++; else { errs++; errors.push({ to, error: res.error ?? "erro" }); }
      void logIgWebhook({
        direction: "outbound",
        status: res.ok ? "ok" : "error",
        event_type: "campaign_send",
        store_id: data.storeId,
        recipient_id: to,
        error: res.ok ? null : res.error ?? null,
        request: { template_id: data.templateId, template_name: tpl.name, text: rendered.slice(0, 500) },
        response: res,
      });
    }
    return { ok: true as const, sent, errs, errors };
  });
