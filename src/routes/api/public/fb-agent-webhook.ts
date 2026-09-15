import { createFileRoute } from "@tanstack/react-router";
import { runAgentForMessage } from "@/lib/wa-agent.server";
import { sendMessengerMessage, replyToComment, type FbCredentials } from "@/lib/fb-driver.server";
import { verifyMetaSignature } from "@/lib/meta-webhook.server";
import { logFbWebhook } from "@/lib/fb-logs.server";

/**
 * Webhook do Facebook Messenger + Page Feed (comentários).
 * Roteia por recipient.id (Page id) -> wa_settings.fb_page_id.
 *
 * Meta / Facebook:
 *   Callback URL: https://<seu-dominio>/api/public/fb-agent-webhook
 *   Verify token: FB_WEBHOOK_VERIFY_TOKEN (fallback: IG_WEBHOOK_VERIFY_TOKEN)
 *   Objeto: `page`. Campos: `messages`, `messaging_postbacks`, `feed`.
 */
export const Route = createFileRoute("/api/public/fb-agent-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected =
          process.env.FB_WEBHOOK_VERIFY_TOKEN ??
          process.env.IG_WEBHOOK_VERIFY_TOKEN ??
          "";
        if (mode === "subscribe" && expected && token === expected && challenge) {
          void logFbWebhook({ direction: "inbound", status: "ok", event_type: "verify", http_status: 200 });
          return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        void logFbWebhook({
          direction: "inbound", status: "error", event_type: "verify",
          http_status: 403, error: "verify_token_mismatch",
        });
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const sigOk = await verifyMetaSignature(request, raw);
        if (!sigOk) {
          void logFbWebhook({
            direction: "inbound", status: "invalid_signature", signature_valid: false,
            http_status: 401, error: "invalid_signature", request: raw.slice(0, 4000),
          });
          return new Response("Invalid signature", { status: 401 });
        }
        let body: any = {};
        try { body = JSON.parse(raw); } catch {
          void logFbWebhook({
            direction: "inbound", status: "bad_json", signature_valid: true,
            http_status: 400, error: "bad_json", request: raw.slice(0, 4000),
          });
          return new Response("Bad JSON", { status: 400 });
        }
        const { isFreshMetaPayload } = await import("@/lib/webhook-replay.server");
        if (!isFreshMetaPayload(body)) {
          void logFbWebhook({
            direction: "inbound", status: "stale", signature_valid: true,
            http_status: 401, error: "stale_payload", request: body,
          });
          return new Response("Stale payload", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];

        (async () => {
          for (const entry of entries) {
            const pageId: string | undefined = entry?.id;
            // Descobre loja pelo fb_page_id
            const { data: settings } = await supabaseAdmin
              .from("wa_settings")
              .select("store_id, fb_active, fb_token, fb_page_id, provider, cloud_token, cloud_phone_id, zapi_instance_id, zapi_token, zapi_client_token")
              .eq("fb_page_id", pageId ?? "")
              .maybeSingle();

            if (!settings || !(settings as any).fb_active) {
              void logFbWebhook({
                direction: "inbound", status: "ignored", signature_valid: true,
                event_type: "no_active_store", recipient_id: pageId ?? null,
                error: "no_active_store_for_page",
              });
              continue;
            }
            const storeId = (settings as any).store_id as string;
            const { data: storeRow } = await supabaseAdmin
              .from("stores").select("name").eq("id", storeId).maybeSingle();

            const fbCreds: FbCredentials = {
              fb_token: (settings as any).fb_token,
              fb_page_id: (settings as any).fb_page_id,
              fb_active: (settings as any).fb_active,
            };

            // 1) Messaging (Messenger DMs)
            const messagingEvents: any[] = Array.isArray(entry?.messaging) ? entry.messaging : [];
            for (const ev of messagingEvents) {
              try {
                if (ev?.message?.is_echo) {
                  void logFbWebhook({
                    direction: "inbound", status: "ignored", signature_valid: true,
                    event_type: "echo", sender_id: ev?.sender?.id ?? null, recipient_id: ev?.recipient?.id ?? null,
                    store_id: storeId,
                  });
                  continue;
                }
                const senderId: string | undefined = ev?.sender?.id;
                const recipientId: string | undefined = ev?.recipient?.id;
                if (!senderId || !recipientId) continue;

                let text = "";
                const msg = ev.message ?? {};
                if (typeof msg.text === "string") text = msg.text;
                else if (msg.text?.body) text = msg.text.body;
                else if (Array.isArray(msg.attachments) && msg.attachments.length) {
                  text = `[${msg.attachments[0]?.type ?? "attachment"}]`;
                } else if (ev.postback?.title) text = String(ev.postback.title);
                if (!text) continue;

                let convId = "";
                const { data: existing } = await supabaseAdmin
                  .from("wa_conversations")
                  .select("id,customer_id,cart,wa_name,channel")
                  .eq("store_id", storeId).eq("phone", senderId).eq("channel", "messenger")
                  .maybeSingle();
                if (existing) convId = (existing as any).id;
                else {
                  const { data: created, error: cerr } = await supabaseAdmin
                    .from("wa_conversations")
                    .insert({ store_id: storeId, phone: senderId, channel: "messenger" })
                    .select("id").single();
                  if (cerr) {
                    void logFbWebhook({
                      direction: "inbound", status: "error", signature_valid: true, store_id: storeId,
                      event_type: "insert_conversation", sender_id: senderId, recipient_id: recipientId,
                      error: cerr.message,
                    });
                    continue;
                  }
                  convId = (created as any).id;
                }

                const { data: convFull } = await supabaseAdmin
                  .from("wa_conversations")
                  .select("id,store_id,phone,wa_name,customer_id,cart,channel")
                  .eq("id", convId).single();

                await runAgentForMessage({
                  conversation: convFull as any,
                  incomingText: text,
                  waCreds: settings as any,
                  storeName: (storeRow as any)?.name ?? null,
                  channel: "messenger" as any,
                  sendFn: (to, msgText) => sendMessengerMessage(fbCreds, to, msgText),
                });

                void logFbWebhook({
                  direction: "inbound", status: "ok", signature_valid: true, store_id: storeId,
                  event_type: "message", sender_id: senderId, recipient_id: recipientId,
                  request: { text: text.slice(0, 500) },
                });
              } catch (e) {
                void logFbWebhook({
                  direction: "inbound", status: "error", signature_valid: true, store_id: storeId,
                  event_type: "process_message", error: (e as Error).message,
                });
              }
            }

            // 2) Feed comments (comentários em posts da Página)
            const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const ch of changes) {
              if (ch?.field !== "feed") continue;
              const value = ch?.value ?? {};
              if (value.item !== "comment" || value.verb !== "add") continue;
              // ignora comentários feitos pela própria página
              if (value?.from?.id && value.from.id === pageId) continue;

              const commentId: string | undefined = value.comment_id;
              const message: string = value.message ?? "";
              const senderId: string | undefined = value?.from?.id;

              try {
                if (commentId && message.trim()) {
                  // Gera resposta via agente (dry) e responde ao comentário
                  const { data: convFull } = await supabaseAdmin
                    .from("wa_conversations")
                    .select("id,store_id,phone,wa_name,customer_id,cart,channel")
                    .eq("store_id", storeId).eq("phone", senderId ?? commentId).eq("channel", "fb_comment")
                    .maybeSingle();

                  let convId = (convFull as any)?.id ?? "";
                  if (!convId) {
                    const { data: created } = await supabaseAdmin
                      .from("wa_conversations")
                      .insert({ store_id: storeId, phone: senderId ?? commentId, channel: "fb_comment" })
                      .select("id,store_id,phone,wa_name,customer_id,cart,channel").single();
                    convId = (created as any)?.id;
                  }
                  const { data: convRow } = await supabaseAdmin
                    .from("wa_conversations")
                    .select("id,store_id,phone,wa_name,customer_id,cart,channel")
                    .eq("id", convId).single();

                  await runAgentForMessage({
                    conversation: convRow as any,
                    incomingText: message,
                    waCreds: settings as any,
                    storeName: (storeRow as any)?.name ?? null,
                    channel: "messenger" as any, // reutiliza persona
                    sendFn: (_to, reply) => replyToComment(fbCreds, commentId, reply),
                  });

                  void logFbWebhook({
                    direction: "inbound", status: "ok", signature_valid: true, store_id: storeId,
                    event_type: "feed_comment", sender_id: senderId ?? null, recipient_id: pageId ?? null,
                    request: { comment_id: commentId, message: message.slice(0, 500) },
                  });
                }
              } catch (e) {
                void logFbWebhook({
                  direction: "inbound", status: "error", signature_valid: true, store_id: storeId,
                  event_type: "feed_comment", sender_id: senderId ?? null, recipient_id: pageId ?? null,
                  error: (e as Error).message,
                });
              }
            }
          }
        })().catch((e) => {
          void logFbWebhook({
            direction: "inbound", status: "error", signature_valid: true,
            event_type: "background", error: (e as Error).message,
          });
        });

        return Response.json({ ok: true });
      },
    },
  },
});
