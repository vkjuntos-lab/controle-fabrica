import { createFileRoute } from "@tanstack/react-router";

import { writeSystemAudit } from "@/lib/audit/functions";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { validateWebhookSignature } from "@/lib/webhook/signature";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Receptor genérico de webhooks. Antes de qualquer efeito colateral:
 * 1. valida assinatura HMAC (header `x-webhook-signature`);
 * 2. aplica rate limit;
 * 3. deduplica via idempotência (`x-webhook-id`) na tabela `webhook_events`.
 *
 * Enquanto `WEBHOOK_SECRET` não estiver configurado no ambiente, o endpoint
 * responde 503 — não é uma simulação, é o estado real da configuração.
 */
export const Route = createFileRoute("/api/webhooks/receiver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provider = request.headers.get("x-webhook-provider") ?? "unknown";
        const eventId = request.headers.get("x-webhook-id") ?? "";

        const rawBody = await request.text();
        if (rawBody.length > 1_000_000) {
          return json({ ok: false, message: "Payload muito grande." }, 413);
        }

        const signatureStatus = await validateWebhookSignature(
          rawBody,
          request.headers.get("x-webhook-signature"),
        );
        if (signatureStatus === "missing_secret") {
          return json(
            { ok: false, message: "Webhooks desabilitados: defina WEBHOOK_SECRET no ambiente." },
            503,
          );
        }
        if (signatureStatus in ["invalid", "missing_signature"]) {
          await writeSystemAudit({
            action: "webhook.reject",
            resource: "webhook_events",
            result: "error",
            context: { provider, eventId, signatureStatus },
          });
          return json({ ok: false, message: "Assinatura inválida." }, 401);
        }

        if (!checkRateLimit(`webhook:${provider}`, { limit: 120, windowMs: 60_000 })) {
          return json({ ok: false, message: "Muitas requisições." }, 429);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing } = await supabaseAdmin
          .from("webhook_events")
          .select("id")
          .eq("provider", provider)
          .eq("event_id", eventId)
          .maybeSingle();

        if (existing) {
          return json({ ok: true, duplicate: true, id: existing.id });
        }

        const { data: inserted, error } = await supabaseAdmin
          .from("webhook_events")
          .insert({ provider, event_id: eventId, signature_ok: true })
          .select("id")
          .single();

        if (error) {
          if (error.code === "23505") {
            return json({ ok: true, duplicate: true });
          }
          console.error("[webhook] falha ao persistir evento:", error.message);
          return json({ ok: false, message: "Falha ao registrar evento." }, 500);
        }

        await writeSystemAudit({
          action: "webhook.received",
          resource: "webhook_events",
          resourceId: inserted.id,
          result: "success",
          context: { provider, eventId },
        });

        return json({ ok: true, id: inserted.id, accepted: true }, 202);
      },
      GET: () => json({ ok: true, message: "Webhook receiver ativo." }, 200),
    },
  },
});