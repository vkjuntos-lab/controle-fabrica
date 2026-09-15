import { createFileRoute } from "@tanstack/react-router";
import { verifyMetaSignature } from "@/lib/meta-webhook.server";

/**
 * Webhook do WhatsApp Business (Meta Cloud API) para status de mensagens
 * enviadas por pedidos da vitrine.
 *
 * - GET: verificação do webhook (Meta envia hub.challenge)
 *   Usa WA_WEBHOOK_VERIFY_TOKEN.
 * - POST: recebe eventos `messages.statuses[]` com `id` = message_id
 *   Atualiza o pedido correspondente via RPC storefront_wa_update_status.
 *
 * URL para configurar no Meta:
 *   https://project--2bff89e1-7464-48ef-a026-6814e05c6ee1.lovable.app/api/public/wa-storefront-webhook
 */
export const Route = createFileRoute("/api/public/wa-storefront-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "";
        if (mode === "subscribe" && expected && token === expected && challenge) {
          return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!(await verifyMetaSignature(request, raw))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let body: any = {};
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const { isFreshMetaPayload } = await import("@/lib/webhook-replay.server");
        if (!isFreshMetaPayload(body)) {
          console.warn("[wa-storefront-webhook] payload fora da janela ±5min (replay)");
          return new Response("Stale payload", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const updates: Array<{ id: string; status: string; error?: string }> = [];

        // Meta Cloud API payload shape
        const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
        for (const entry of entries) {
          const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
          for (const ch of changes) {
            const statuses: any[] = Array.isArray(ch?.value?.statuses) ? ch.value.statuses : [];
            for (const s of statuses) {
              if (!s?.id || !s?.status) continue;
              const err = Array.isArray(s.errors) && s.errors[0]
                ? (s.errors[0].title ?? s.errors[0].message ?? String(s.errors[0].code ?? ""))
                : undefined;
              updates.push({ id: String(s.id), status: String(s.status), error: err });
            }
          }
        }

        // Z-API payload compat: { messageId, status } ou { ids:[...], type }
        if (updates.length === 0 && body?.messageId && body?.status) {
          updates.push({ id: String(body.messageId), status: String(body.status) });
        }

        let ok = 0;
        for (const u of updates) {
          try {
            const { data } = await (supabaseAdmin as any).rpc("storefront_wa_update_status", {
              _message_id: u.id, _status: u.status, _error: u.error ?? null,
            });
            if (data) ok += 1;
          } catch (e) {
            console.error("[wa-storefront-webhook] rpc error:", (e as Error).message);
          }
        }

        console.log(`[wa-storefront-webhook] statuses=${updates.length} updated=${ok}`);
        return Response.json({ ok: true, received: updates.length, updated: ok });
      },
    },
  },
});
