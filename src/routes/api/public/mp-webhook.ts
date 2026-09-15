import { createFileRoute } from "@tanstack/react-router";
import { verifyMercadoPagoSignature } from "@/lib/webhook-replay.server";

/**
 * Webhook público do Mercado Pago.
 *
 * Autenticação em camadas (fail-closed):
 *  1) Se o header `x-signature` estiver presente E `MP_WEBHOOK_SIGNATURE_KEY`
 *     configurado, exige HMAC-SHA256 válido no manifest oficial do MP com
 *     timestamp fresco (±5min). Rejeita com 401 caso contrário.
 *  2) Caso não haja `x-signature` (compat com URLs legadas), continua
 *     exigindo `?secret=<MP_WEBHOOK_SECRET>` no query string.
 *
 * Endereço estável (usar no painel MP):
 *   https://project--2bff89e1-7464-48ef-a026-6814e05c6ee1.lovable.app/api/public/mp-webhook?secret=<MP_WEBHOOK_SECRET>
 */
export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("mp-webhook ok", { status: 200 }),
      POST: async ({ request }) => {
        const raw = await request.text();
        const hasSig = !!request.headers.get("x-signature");
        const hasSigKey = !!process.env.MP_WEBHOOK_SIGNATURE_KEY;

        if (hasSig && hasSigKey) {
          const check = await verifyMercadoPagoSignature(request, raw);
          if (!check.ok) {
            console.warn("[mp-webhook] assinatura inválida:", check.reason);
            return new Response("Unauthorized", { status: 401 });
          }
        } else {
          // Fallback legado: exige ?secret= no query string.
          const url = new URL(request.url);
          const providedSecret = url.searchParams.get("secret") ?? "";
          const expectedSecret = process.env.MP_WEBHOOK_SECRET ?? "";
          if (!expectedSecret || providedSecret !== expectedSecret) {
            console.warn("[mp-webhook] segredo inválido / assinatura ausente");
            return new Response("Unauthorized", { status: 401 });
          }
        }

        try {
          const { buildDriver } = await import("@/lib/gateways/registry.server");
          const { logAndApplyWebhook } = await import("@/lib/gateways/webhook-log.server");
          const driver = buildDriver({
            storeId: null, provider: "mercadopago", sandbox: false,
            config: {
              access_token: process.env.MP_ACCESS_TOKEN,
              webhook_secret: process.env.MP_WEBHOOK_SECRET,
            },
          });
          const parsed = await driver.parseWebhook(request, raw);
          await logAndApplyWebhook({ provider: "mercadopago", request, rawBody: raw, parsed });
        } catch (e) {
          console.error("[mp-webhook] erro:", (e as Error).message);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
