import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

/**
 * Cron: expira reservas vencidas da vitrine e libera estoque.
 *
 * Autenticação: header `x-cron-secret`, `Authorization: Bearer <secret>`
 * ou query `?secret=` — comparado contra CRON_SECRET/MP_WEBHOOK_SECRET.
 * A chave pública do Supabase NÃO é aceita.
 */
export const Route = createFileRoute("/api/public/storefront-expire")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .rpc("storefront_expire_reservations");

        if (error) {
          console.error("[storefront-expire] rpc error:", error.message);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const cancelled = Array.isArray(data) ? data.map((r: any) => r.code) : [];
        console.log(`[storefront-expire] cancelled=${cancelled.length}`, cancelled);
        return Response.json({ ok: true, cancelled });
      },
    },
  },
});
