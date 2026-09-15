import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";
import { refreshIgLongLivedToken } from "@/lib/ig-token.server";

/**
 * Endpoint público (cron) que renova tokens do Instagram (long-lived, 60d)
 * cujo `ig_token_expires_at` esteja dentro dos próximos 10 dias.
 *
 * Requer header/query `x-cron-secret` (ou Bearer) igual a CRON_SECRET/MP_WEBHOOK_SECRET.
 * Agende via pg_cron a cada 24h.
 */
export const Route = createFileRoute("/api/public/ig-token-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
        const { data: rows, error } = await supabaseAdmin
          .from("wa_settings")
          .select("store_id, ig_token, ig_app_id, ig_token_expires_at, ig_active")
          .not("ig_token", "is", null)
          .or(`ig_token_expires_at.is.null,ig_token_expires_at.lte.${cutoff}`);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: Array<{ store_id: string; ok: boolean; error?: string; expires_at?: string | null }> = [];
        for (const r of rows ?? []) {
          const res = await refreshIgLongLivedToken({
            token: (r as any).ig_token,
            appId: (r as any).ig_app_id ?? process.env.META_APP_ID ?? "",
            appSecret: process.env.META_APP_SECRET ?? "",
          });
          if (!res.ok) {
            results.push({ store_id: (r as any).store_id, ok: false, error: res.error });
            continue;
          }
          const expires_at = res.expiresIn
            ? new Date(Date.now() + res.expiresIn * 1000).toISOString()
            : null;
          await supabaseAdmin
            .from("wa_settings")
            .update({ ig_token: res.token, ig_token_expires_at: expires_at })
            .eq("store_id", (r as any).store_id);
          results.push({ store_id: (r as any).store_id, ok: true, expires_at });
        }
        return Response.json({ ok: true, refreshed: results });
      },
      GET: async ({ request }) => {
        // Facilita agendamento por GET também.
        if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
        return Response.json({ ok: true, hint: "POST para executar a renovação" });
      },
    },
  },
});
