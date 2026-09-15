// Server functions do painel do Facebook (Messenger + Página).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type FbSettings = {
  store_id: string;
  fb_token: string | null;
  fb_page_id: string | null;
  fb_app_id: string | null;
  fb_token_expires_at: string | null;
  fb_active: boolean;
};

export const getFbSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<FbSettings> => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("wa_settings")
      .select("store_id, fb_token, fb_page_id, fb_app_id, fb_token_expires_at, fb_active")
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      store_id: data.storeId,
      fb_token: row?.fb_token ?? null,
      fb_page_id: row?.fb_page_id ?? null,
      fb_app_id: row?.fb_app_id ?? null,
      fb_token_expires_at: row?.fb_token_expires_at ?? null,
      fb_active: !!row?.fb_active,
    };
  });

export const saveFbSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    storeId: string;
    fb_token?: string | null;
    fb_page_id?: string | null;
    fb_app_id?: string | null;
    fb_active?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const patch: Record<string, unknown> = {
      store_id: data.storeId,
      fb_token: data.fb_token ?? null,
      fb_page_id: data.fb_page_id ?? null,
      fb_app_id: data.fb_app_id ?? null,
      fb_active: !!data.fb_active,
    };
    const { error } = await supabase.from("wa_settings").upsert(patch, { onConflict: "store_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFbWebhookInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = process.env.FB_WEBHOOK_VERIFY_TOKEN ?? process.env.IG_WEBHOOK_VERIFY_TOKEN ?? "";
    const appSecret = process.env.META_APP_SECRET ?? "";
    const appId = process.env.META_APP_ID ?? "";
    return {
      webhook_path: "/api/public/fb-agent-webhook",
      verify_token_set: !!token,
      verify_token_preview: token ? token.slice(0, 4) + "…" + token.slice(-2) : null,
      app_secret_set: !!appSecret,
      app_id_set: !!appId,
    };
  });

/** Teste de envio Messenger (`to` = PSID). */
export const testFbSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; to: string; message?: string }) =>
    z.object({ storeId: z.string().uuid(), to: z.string().min(3), message: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("wa_settings").select("fb_token, fb_page_id, fb_active")
      .eq("store_id", data.storeId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.fb_token || !row?.fb_page_id) return { ok: false as const, error: "Credenciais do Facebook incompletas." };
    const { sendMessengerMessage } = await import("@/lib/fb-driver.server");
    return sendMessengerMessage(
      { fb_token: row.fb_token, fb_page_id: row.fb_page_id, fb_active: row.fb_active },
      data.to,
      data.message ?? "🧪 Teste de conexão do Messenger (Bella IA).",
    );
  });

/** Publica post de texto (ou texto+link) no feed da Página. */
export const publishFbPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    storeId: string;
    message: string;
    link?: string | null;
    imageUrl?: string | null;
    scheduledAt?: string | null; // ISO
  }) => z.object({
    storeId: z.string().uuid(),
    message: z.string().min(1).max(60000),
    link: z.string().url().nullish(),
    imageUrl: z.string().url().nullish(),
    scheduledAt: z.string().datetime().nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("wa_settings").select("fb_token, fb_page_id, fb_active")
      .eq("store_id", data.storeId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.fb_token || !row?.fb_page_id) return { ok: false as const, error: "Credenciais do Facebook incompletas." };
    const creds = { fb_token: row.fb_token, fb_page_id: row.fb_page_id, fb_active: row.fb_active };
    const scheduled = data.scheduledAt ? Math.floor(new Date(data.scheduledAt).getTime() / 1000) : null;
    const { logFbWebhook } = await import("@/lib/fb-logs.server");
    if (data.imageUrl) {
      const { publishPagePhoto } = await import("@/lib/fb-driver.server");
      const res = await publishPagePhoto(creds, { imageUrl: data.imageUrl, caption: data.message, published: !scheduled });
      void logFbWebhook({
        store_id: data.storeId, direction: "outbound",
        status: res.ok ? "ok" : "error", event_type: "publish_photo",
        request: { message: data.message.slice(0, 500), imageUrl: data.imageUrl, scheduledAt: data.scheduledAt ?? null },
        response: res, error: res.ok ? null : res.error ?? null,
      });
      return res;
    }
    const { publishPagePost } = await import("@/lib/fb-driver.server");
    const res = await publishPagePost(creds, {
      message: data.message, link: data.link ?? null,
      scheduled_publish_time: scheduled,
    });
    void logFbWebhook({
      store_id: data.storeId, direction: "outbound",
      status: res.ok ? "ok" : "error", event_type: "publish_post",
      request: { message: data.message.slice(0, 500), link: data.link ?? null, scheduledAt: data.scheduledAt ?? null },
      response: res, error: res.ok ? null : res.error ?? null,
    });
    return res;
  });

/** Lista posts recentes da Página. */
export const listFbPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; limit?: number }) =>
    z.object({ storeId: z.string().uuid(), limit: z.number().int().min(1).max(50).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: row } = await supabase.from("wa_settings")
      .select("fb_token, fb_page_id, fb_active").eq("store_id", data.storeId).maybeSingle();
    if (!row?.fb_token || !row?.fb_page_id) return { ok: false as const, error: "Credenciais do Facebook incompletas." };
    const { listPagePosts } = await import("@/lib/fb-driver.server");
    return listPagePosts({ fb_token: row.fb_token, fb_page_id: row.fb_page_id, fb_active: row.fb_active }, data.limit ?? 20);
  });

/** Renova o token de página para long-lived (~60 dias). */
export const refreshFbToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("wa_settings").select("fb_token, fb_app_id")
      .eq("store_id", data.storeId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.fb_token) return { ok: false as const, error: "Sem token para renovar." };
    const { refreshIgLongLivedToken } = await import("@/lib/ig-token.server");
    const res = await refreshIgLongLivedToken({
      token: row.fb_token,
      appId: (row.fb_app_id ?? process.env.META_APP_ID ?? "") as string,
      appSecret: process.env.META_APP_SECRET ?? "",
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    const expires_at = res.expiresIn ? new Date(Date.now() + res.expiresIn * 1000).toISOString() : null;
    const { error: upErr } = await supabase
      .from("wa_settings")
      .update({ fb_token: res.token, fb_token_expires_at: expires_at })
      .eq("store_id", data.storeId);
    if (upErr) return { ok: false as const, error: upErr.message };
    return { ok: true as const, expires_at };
  });

/** Logs do webhook do Facebook. */
export const listFbWebhookLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId?: string | null; status?: string | null; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    let q = supabase
      .from("fb_webhook_logs")
      .select("id, created_at, direction, status, http_status, signature_valid, event_type, sender_id, recipient_id, error, request, response, store_id")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(data.limit ?? 100, 1), 500));
    if (data.storeId) q = q.or(`store_id.eq.${data.storeId},store_id.is.null`);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
