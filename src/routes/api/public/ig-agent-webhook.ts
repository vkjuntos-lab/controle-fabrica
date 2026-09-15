import { createFileRoute } from "@tanstack/react-router";
import { runAgentForMessage } from "@/lib/wa-agent.server";
import { sendInstagramMessage, type IgCredentials } from "@/lib/ig-driver.server";
import { verifyMetaSignature } from "@/lib/meta-webhook.server";
import { logIgWebhook } from "@/lib/ig-logs.server";

/**
 * Webhook do Instagram Messaging API (Meta) para MENSAGENS ENTRANTES no Direct.
 * Roteia por recipient.id (IG business user id) -> wa_settings.ig_user_id (define a loja).
 *
 * Configurar no Meta / Instagram:
 *   Callback URL: https://<seu-dominio>/api/public/ig-agent-webhook
 *   Verify token: valor de IG_WEBHOOK_VERIFY_TOKEN
 *   Objeto: `instagram`, campo: `messages`.
 */
export const Route = createFileRoute("/api/public/ig-agent-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.IG_WEBHOOK_VERIFY_TOKEN ?? "";
        if (mode === "subscribe" && expected && token === expected && challenge) {
          void logIgWebhook({ direction: "inbound", status: "ok", event_type: "verify", http_status: 200 });
          return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        void logIgWebhook({
          direction: "inbound",
          status: "error",
          event_type: "verify",
          http_status: 403,
          error: "verify_token_mismatch",
        });
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const sigOk = await verifyMetaSignature(request, raw);
        if (!sigOk) {
          void logIgWebhook({
            direction: "inbound",
            status: "invalid_signature",
            signature_valid: false,
            http_status: 401,
            error: "invalid_signature",
            request: raw.slice(0, 4000),
          });
          return new Response("Invalid signature", { status: 401 });
        }
        let body: any = {};
        try { body = JSON.parse(raw); } catch {
          void logIgWebhook({
            direction: "inbound",
            status: "bad_json",
            signature_valid: true,
            http_status: 400,
            error: "bad_json",
            request: raw.slice(0, 4000),
          });
          return new Response("Bad JSON", { status: 400 });
        }
        const { isFreshMetaPayload } = await import("@/lib/webhook-replay.server");
        if (!isFreshMetaPayload(body)) {
          console.warn("[ig-agent-webhook] payload fora da janela ±5min (replay)");
          void logIgWebhook({
            direction: "inbound",
            status: "stale",
            signature_valid: true,
            http_status: 401,
            error: "stale_payload",
            request: body,
          });
          return new Response("Stale payload", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];

        // Processa em background para responder rápido ao Meta (evita reentrega).
        (async () => {
          for (const entry of entries) {
            // Formato IG: entry.messaging = [{ sender:{id}, recipient:{id}, message:{...} }]
            // ou entry.changes = [{ value: { messages, ...} }] em alguns setups.
            const messagingEvents: any[] = Array.isArray(entry?.messaging) ? entry.messaging : [];

            // Fallback para formato "changes"
            const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const ch of changes) {
              const value = ch?.value ?? {};
              if (Array.isArray(value.messages)) {
                for (const m of value.messages) {
                  messagingEvents.push({
                    sender: { id: m.from ?? value?.sender?.id },
                    recipient: { id: value?.recipient?.id ?? entry?.id },
                    message: m,
                  });
                }
              }
            }

            for (const ev of messagingEvents) {
              try {
                // Ignora echoes (mensagens enviadas por nós)
                if (ev?.message?.is_echo) {
                  void logIgWebhook({
                    direction: "inbound", status: "ignored", signature_valid: true,
                    event_type: "echo", sender_id: ev?.sender?.id ?? null, recipient_id: ev?.recipient?.id ?? null,
                  });
                  continue;
                }

                const senderId: string | undefined = ev?.sender?.id;
                const recipientId: string | undefined = ev?.recipient?.id;
                if (!senderId || !recipientId) continue;

                // Extrai texto
                let text = "";
                const msg = ev.message ?? {};
                if (typeof msg.text === "string") text = msg.text;
                else if (msg.text?.body) text = msg.text.body;
                else if (Array.isArray(msg.attachments) && msg.attachments.length) {
                  const kind = msg.attachments[0]?.type ?? "attachment";
                  text = `[${kind}]`;
                } else if (ev.postback?.title) {
                  text = String(ev.postback.title);
                } else {
                  text = "";
                }
                if (!text) continue;

                // Descobre a loja pelo ig_user_id (destinatário = conta business)
                const { data: settings } = await supabaseAdmin
                  .from("wa_settings")
                  .select("store_id, ig_active, ig_token, ig_user_id, ig_page_id, provider, cloud_token, cloud_phone_id, zapi_instance_id, zapi_token, zapi_client_token")
                  .eq("ig_user_id", recipientId)
                  .maybeSingle();

                if (!settings || !(settings as any).ig_active) {
                  console.warn("[ig-agent-webhook] Sem loja ativa p/ ig_user_id:", recipientId);
                  void logIgWebhook({
                    direction: "inbound", status: "ignored", signature_valid: true,
                    event_type: "no_active_store", sender_id: senderId, recipient_id: recipientId,
                    error: "no_active_store_for_recipient",
                  });
                  continue;
                }
                const storeId = (settings as any).store_id as string;
                const { data: storeRow } = await supabaseAdmin
                  .from("stores").select("name").eq("id", storeId).maybeSingle();

                // upsert conversa (store_id, phone=senderId, channel=instagram)
                let convId = "";
                const { data: existing } = await supabaseAdmin
                  .from("wa_conversations")
                  .select("id,customer_id,cart,wa_name,channel")
                  .eq("store_id", storeId)
                  .eq("phone", senderId)
                  .eq("channel", "instagram")
                  .maybeSingle();
                if (existing) {
                  convId = (existing as any).id;
                } else {
                  const { data: created, error: cerr } = await supabaseAdmin
                    .from("wa_conversations")
                    .insert({ store_id: storeId, phone: senderId, channel: "instagram" })
                    .select("id,customer_id,cart,wa_name,channel").single();
                  if (cerr) {
                    console.error("[ig-agent-webhook] insert conv:", cerr.message);
                    void logIgWebhook({
                      direction: "inbound", status: "error", signature_valid: true, store_id: storeId,
                      event_type: "insert_conversation", sender_id: senderId, recipient_id: recipientId,
                      error: cerr.message,
                    });
                    continue;
                  }
                  convId = (created as any).id;
                }
                if (!convId) continue;

                const { data: convFull } = await supabaseAdmin
                  .from("wa_conversations")
                  .select("id,store_id,phone,wa_name,customer_id,cart,channel")
                  .eq("id", convId).single();

                const igCreds: IgCredentials = {
                  ig_token: (settings as any).ig_token,
                  ig_user_id: (settings as any).ig_user_id,
                  ig_page_id: (settings as any).ig_page_id,
                  ig_active: (settings as any).ig_active,
                };

                await runAgentForMessage({
                  conversation: convFull as any,
                  incomingText: text,
                  waCreds: settings as any,
                  storeName: (storeRow as any)?.name ?? null,
                  channel: "instagram",
                  sendFn: (to, msgText) => sendInstagramMessage(igCreds, to, msgText),
                });

                void logIgWebhook({
                  direction: "inbound", status: "ok", signature_valid: true, store_id: storeId,
                  event_type: "message", sender_id: senderId, recipient_id: recipientId,
                  request: { text: text.slice(0, 500) },
                });
              } catch (e) {
                console.error("[ig-agent-webhook] event error:", (e as Error).message);
                void logIgWebhook({
                  direction: "inbound", status: "error", signature_valid: true,
                  event_type: "process", sender_id: ev?.sender?.id ?? null, recipient_id: ev?.recipient?.id ?? null,
                  error: (e as Error).message,
                });
              }
            }
          }
        })().catch((e) => {
          console.error("[ig-agent-webhook] bg:", e);
          void logIgWebhook({
            direction: "inbound", status: "error", signature_valid: true,
            event_type: "background", error: (e as Error).message,
          });
        });

        return Response.json({ ok: true });
      },
    },
  },
});
