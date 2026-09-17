import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { writeSystemAudit } from "@/lib/audit/functions";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Health check acessível por agendamentos (cron). Não executa efeito
 * colateral: apenas valida autenticação, aplica rate limit e responde.
 * Para cron disparar de fato, configure `LOVABLE_CRON_SECRET` no ambiente
 * e envie `Authorization: Bearer <secret>`.
 */
export const Route = createFileRoute("/api/cron/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        if (!checkRateLimit("cron:health", { limit: 10, windowMs: 60_000 })) {
          return json({ ok: false, message: "Muitas requisições." }, 429);
        }

        await writeSystemAudit({
          action: "cron.health",
          resource: "system",
          result: "success",
          context: { ts: new Date().toISOString() },
        });

        return json({ ok: true, status: "healthy", ts: new Date().toISOString() });
      },
    },
  },
});
