import { createFileRoute } from "@tanstack/react-router";

/**
 * Callback de "Exclusão de dados" da Meta.
 * URL: https://<seu-dominio>/api/public/ig-oauth/data-deletion
 */
export const Route = createFileRoute("/api/public/ig-oauth/data-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const raw = await request.text();
        const signed = new URLSearchParams(raw).get("signed_request") ?? "";
        const { parseSignedRequest } = await import("@/lib/ig-oauth.server");
        const payload = await parseSignedRequest(signed);
        if (!payload) return new Response("Invalid signed_request", { status: 401 });

        const igUserId = payload.user_id != null ? String(payload.user_id) : null;
        const confirmationCode = `ig-${igUserId ?? "unknown"}-${Date.now()}`;

        if (igUserId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("wa_settings")
            .update({ ig_token: null, ig_user_id: null, ig_active: false, ig_token_expires_at: null })
            .eq("ig_user_id", igUserId);
        }

        return Response.json({
          url: `${url.origin}/pdv/instagram?data_deletion=${encodeURIComponent(confirmationCode)}`,
          confirmation_code: confirmationCode,
        });
      },
      GET: async () => Response.json({ ok: true, hint: "Data deletion callback (POST)" }),
    },
  },
});
