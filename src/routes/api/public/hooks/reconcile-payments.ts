import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

/**
 * Onda J — Cron diário de reconciliação.
 *
 * Autenticação: header `x-cron-secret`, `Authorization: Bearer <secret>`
 * ou query `?secret=` — comparado contra CRON_SECRET/MP_WEBHOOK_SECRET.
 * A chave pública do Supabase NÃO é aceita.
 */
export const Route = createFileRoute("/api/public/hooks/reconcile-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { runReconciliation } = await import("@/lib/gateways/reconcile.server");
          const summary = await runReconciliation({ limit: 500 });
          return Response.json({ ok: true, ...summary });
        } catch (e) {
          console.error("[reconcile-payments] err", (e as Error).message);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
      GET: async () => new Response("reconcile-payments ok", { status: 200 }),
    },
  },
});
