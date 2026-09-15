import { createFileRoute } from "@tanstack/react-router";

/**
 * Callback do Instagram Business Login.
 * URL a cadastrar na Meta: https://<seu-dominio>/api/public/ig-oauth/callback
 */
export const Route = createFileRoute("/api/public/ig-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (status: string, extra?: string) =>
          Response.redirect(
            `${url.origin}/pdv/instagram?ig_oauth=${encodeURIComponent(status)}${extra ? `&msg=${encodeURIComponent(extra)}` : ""}`,
            302,
          );

        const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (err) return back("error", err);

        const code = url.searchParams.get("code");
        if (!code) return back("error", "missing_code");

        const { verifyState, exchangeCodeForLongLivedToken, fetchIgUserId, igAppId } = await import(
          "@/lib/ig-oauth.server"
        );
        const storeId = await verifyState(url.searchParams.get("state"));
        if (!storeId) return back("error", "invalid_state");

        const redirectUri = `${url.origin}/api/public/ig-oauth/callback`;
        const res = await exchangeCodeForLongLivedToken(code, redirectUri);
        if (!res.ok) return back("error", res.error);

        const igUserId = res.userId ?? (await fetchIgUserId(res.token));
        const expiresAt = res.expiresIn ? new Date(Date.now() + res.expiresIn * 1000).toISOString() : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("wa_settings").upsert(
          {
            store_id: storeId,
            ig_token: res.token,
            ig_user_id: igUserId,
            ig_app_id: igAppId() || null,
            ig_token_expires_at: expiresAt,
            ig_active: true,
            verified_at: new Date().toISOString(),
            last_test_error: null,
          },
          { onConflict: "store_id" },
        );
        if (error) return back("error", error.message);

        const { logIgWebhook } = await import("@/lib/ig-logs.server");
        void logIgWebhook({
          store_id: storeId,
          direction: "inbound",
          status: "ok",
          event_type: "oauth_connect",
          recipient_id: igUserId,
          request: { redirect_uri: redirectUri },
          response: { connected: true, expires_at: expiresAt },
        });

        return back("ok");
      },
    },
  },
});
