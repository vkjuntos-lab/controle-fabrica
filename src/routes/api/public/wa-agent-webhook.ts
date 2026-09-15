import { createFileRoute } from "@tanstack/react-router";
import { runAgentForMessage } from "@/lib/wa-agent.server";
import { verifyMetaSignature } from "@/lib/meta-webhook.server";

/**
 * Webhook do WhatsApp Cloud API (Meta) para MENSAGENS ENTRANTES.
 * Roteia por metadata.phone_number_id -> wa_settings.cloud_phone_id (define a loja).
 *
 * Configurar no Meta:
 *   Callback URL: https://<seu-dominio>/api/public/wa-agent-webhook
 *   Verify token: valor de WA_WEBHOOK_VERIFY_TOKEN
 *   Assine o campo `messages`.
 */
export const Route = createFileRoute("/api/public/wa-agent-webhook")({
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
          console.warn(
            "[wa-agent-webhook] assinatura inválida",
            JSON.stringify({
              has_secret: !!process.env.META_APP_SECRET,
              has_header: !!request.headers.get("x-hub-signature-256"),
              body_len: raw.length,
            }),
          );
          return new Response("Invalid signature", { status: 401 });
        }
        let body: any = {};
        try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        const { isFreshMetaPayload } = await import("@/lib/webhook-replay.server");
        if (!isFreshMetaPayload(body)) {
          console.warn("[wa-agent-webhook] payload fora da janela ±5min (replay)");
          return new Response("Stale payload", { status: 401 });
        }


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];

        // Processa em background para responder rápido ao Meta (evita reentrega).
        (async () => {
          for (const entry of entries) {
            const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const ch of changes) {
              const value = ch?.value ?? {};
              const messages: any[] = Array.isArray(value.messages) ? value.messages : [];
              if (messages.length === 0) continue;
              const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
              const contact = Array.isArray(value.contacts) ? value.contacts[0] : null;
              const waName: string | null = contact?.profile?.name ?? null;

              if (!phoneNumberId) continue;

              // Descobre a loja pelo cloud_phone_id
              const { data: settings } = await supabaseAdmin
                .from("wa_settings")
                .select("store_id, provider, active, cloud_token, cloud_phone_id, cloud_template_name, cloud_template_lang, zapi_instance_id, zapi_token, zapi_client_token")
                .eq("cloud_phone_id", phoneNumberId)
                .maybeSingle();
              if (!settings || !(settings as any).active) {
                console.warn("[wa-agent-webhook] Sem loja ativa p/ phone_number_id:", phoneNumberId);
                continue;
              }
              const storeId = (settings as any).store_id as string;
              const { data: storeRow } = await supabaseAdmin
                .from("stores").select("name").eq("id", storeId).maybeSingle();

              for (const msg of messages) {
                const from: string = msg.from;
                let text = "";
                if (msg.type === "text") text = msg.text?.body ?? "";
                else if (msg.type === "interactive") {
                  text = msg.interactive?.button_reply?.title
                    ?? msg.interactive?.list_reply?.title ?? "";
                } else if (msg.type === "image") text = "[imagem]" + (msg.image?.caption ? " " + msg.image.caption : "");
                else text = `[${msg.type}]`;

                // upsert conversa (store_id, phone)
                let convId = "";
                const { data: existing } = await supabaseAdmin
                  .from("wa_conversations").select("id,customer_id,cart,wa_name")
                  .eq("store_id", storeId).eq("phone", from).maybeSingle();
                if (existing) {
                  convId = (existing as any).id;
                  if (waName && !(existing as any).wa_name) {
                    await supabaseAdmin.from("wa_conversations").update({ wa_name: waName }).eq("id", convId);
                  }
                } else {
                  const { data: created, error: cerr } = await supabaseAdmin
                    .from("wa_conversations")
                    .insert({ store_id: storeId, phone: from, wa_name: waName })
                    .select("id,customer_id,cart,wa_name").single();
                  if (cerr) { console.error("[wa-agent-webhook] insert conv:", cerr.message); continue; }
                  convId = (created as any).id;
                }
                if (!convId) continue;

                const { data: convFull } = await supabaseAdmin
                  .from("wa_conversations").select("id,store_id,phone,wa_name,customer_id,cart")
                  .eq("id", convId).single();

                try {
                  await runAgentForMessage({
                    conversation: convFull as any,
                    incomingText: text,
                    waCreds: settings as any,
                    storeName: (storeRow as any)?.name ?? null,
                  });
                } catch (e) {
                  console.error("[wa-agent-webhook] agent error:", (e as Error).message);
                }
              }
            }
          }
        })().catch((e) => console.error("[wa-agent-webhook] bg:", e));

        return Response.json({ ok: true });
      },
    },
  },
});
