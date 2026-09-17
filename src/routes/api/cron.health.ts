import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import type { FetchHandler } from "@tanstack/react-start";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { writeAuditLog } from "@/lib/audit/functions";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Health check autenticado para agendamentos (cron). Não executa efeito
 * colateral: apenas confirma autenticação, rate limit e disponibilidade.
 */
export const Route = createFileRoute("/api/cron/health")({});

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, message: "Método não permitido." }, 405);
  }

  const authError = await authenticateCronRequest(request);
  if (authError) return authError;

  if (!checkRateLimit("cron:health", { limit: 10, windowMs: 60_000 })) {
    return json({ ok: false, message: "Muitas requisições." }, 429);
  }

  await writeAuditLog({
    action: "cron.health",
    resource: "system",
    result: "success",
    context: { ts: new Date().toISOString() },
  });

  return json({ ok: true, status: "healthy", ts: new Date().toISOString() });
}

export async function handleCronHealthRequest(request: Request): Promise<Response> {
  return handler(request);
}