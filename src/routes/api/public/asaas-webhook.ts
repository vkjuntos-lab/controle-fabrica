// Webhook público do Asaas (multi-loja). Log + pipeline compartilhada.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("asaas-webhook ok", { status: 200 }),
      POST: async ({ request }) => {
        const raw = await request.text();
        const { listActiveDriversByProvider } = await import("@/lib/gateways/registry.server");
        const { logAndApplyWebhook } = await import("@/lib/gateways/webhook-log.server");

        const drivers = await listActiveDriversByProvider("asaas");
        for (const driver of drivers) {
          try {
            const parsed = await driver.parseWebhook(request, raw);
            if (parsed) {
              await logAndApplyWebhook({ provider: "asaas", request, rawBody: raw, parsed });
              return new Response("ok", { status: 200 });
            }
          } catch (e) {
            console.error("[asaas-webhook] driver parse falhou:", (e as Error).message);
          }
        }
        await logAndApplyWebhook({
          provider: "asaas", request, rawBody: raw, parsed: null,
          parseError: "nenhum driver validou o token",
        });
        return new Response("unauthorized", { status: 401 });
      },
    },
  },
});
