import { createFileRoute } from "@tanstack/react-router";

/**
 * Callback de "Cancelar autorização" da Meta.
 * URL: https://<seu-dominio>/api/public/ig-oauth/deauthorize
 */
export const Route = createFileRoute("/api/public/ig-oauth/deauthorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signed = new URLSearchParams(raw).get("signed_request") ?? "";
        const { parseSignedRequest } = await import("@/lib/ig-oauth.server");
        const payload = await parseSignedRequest(signed);
        if (!payload) return new Response("Invalid signed_request", { status: 401 });

        const igUserId = payload.user_id != null ? String(payload.user_id) : null;
        if (igUserId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("wa_settings")
            .update({ ig_token: null, ig_active: false, ig_token_expires_at: null })
            .eq("ig_user_id", igUserId);
        }
        return Response.json({ ok: true });
      },
      GET: async () => Response.json({ ok: true, hint: "Deauthorize callback (POST)" }),
    },
  },
});
