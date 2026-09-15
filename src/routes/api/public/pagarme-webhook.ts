// Webhook público do Pagar.me (multi-loja).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pagarme-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("pagarme-webhook ok", { status: 200 }),
      POST: async ({ request }) => {
        const raw = await request.text();
        const { listActiveDriversByProvider } = await import("@/lib/gateways/registry.server");
        const { logAndApplyWebhook } = await import("@/lib/gateways/webhook-log.server");

        const drivers = await listActiveDriversByProvider("pagarme");
        for (const driver of drivers) {
          try {
            const parsed = await driver.parseWebhook(request, raw);
            if (parsed) {
              await logAndApplyWebhook({ provider: "pagarme", request, rawBody: raw, parsed });
              return new Response("ok", { status: 200 });
            }
          } catch (e) {
            console.error("[pagarme-webhook] driver parse falhou:", (e as Error).message);
          }
        }
        await logAndApplyWebhook({
          provider: "pagarme", request, rawBody: raw, parsed: null,
          parseError: "nenhum driver validou o token",
        });
        return new Response("unauthorized", { status: 401 });
      },
    },
  },
});
