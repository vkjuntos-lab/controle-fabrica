// Server-only helpers do módulo Pós-venda.
// Contém integração com WhatsApp (notificação) e fila fiscal.
import { sendWhatsAppWithCreds, type WaCredentials } from "./wa-driver.server";

function brl(n: number) {
  return `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
}

async function notifyWhatsApp(admin: any, link: any, text: string, source: string) {
  if (!link.wa_conversation_id) return { ok: false, error: "sem_conversa" };
  const { data: conv } = await admin
    .from("wa_conversations")
    .select("id, phone, store_id")
    .eq("id", link.wa_conversation_id)
    .maybeSingle();
  if (!conv) return { ok: false, error: "conversa_inexistente" };
  const { data: settings } = await admin
    .from("wa_settings")
    .select(
      "provider, active, cloud_token, cloud_phone_id, cloud_template_name, cloud_template_lang, zapi_instance_id, zapi_token, zapi_client_token",
    )
    .eq("store_id", (conv as any).store_id)
    .maybeSingle();
  if (!settings) return { ok: false, error: "sem_credenciais" };
  const res = await sendWhatsAppWithCreds(settings as WaCredentials, (conv as any).phone, text);
  await admin.from("wa_messages").insert({
    conversation_id: (conv as any).id,
    direction: res.ok ? "outbound" : "system",
    text: res.ok ? text : `[falha ${source}] ${res.error ?? "erro"}`,
    meta: { source, provider: res.provider, ok: res.ok, error: res.error ?? null },
  });
  return { ok: res.ok, error: res.error };
}

export async function markShipped(
  linkId: string,
  trackingCode: string | null,
  carrier: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: link } = await admin
    .from("payment_links")
    .select(
      "id,code,items,fulfillment,wa_conversation_id,shipped_at,status",
    )
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { ok: false, error: "not_found" };
  if (link.status !== "paid") return { ok: false, error: "pedido_nao_pago" };
  if (link.shipped_at) return { ok: false, error: "ja_enviado" };

  await admin
    .from("payment_links")
    .update({
      shipped_at: new Date().toISOString(),
      tracking_code: trackingCode,
      carrier,
    })
    .eq("id", linkId);

  const trackingTxt = trackingCode
    ? `\n📦 Rastreio: *${trackingCode}*${carrier ? ` (${carrier})` : ""}`
    : "";
  const mode = link.fulfillment?.mode;
  const msg =
    mode === "pickup"
      ? `📬 Pedido *${link.code}* está pronto para retirada no balcão! Te esperamos por lá 💜`
      : `🚚 Pedido *${link.code}* foi enviado!${trackingTxt}\n\nQualquer dúvida é só chamar por aqui 💜`;

  const notify = await notifyWhatsApp(admin, link, msg, "order_shipped");
  return { ok: true, notified: notify.ok, error: notify.error ?? null };
}

export async function reissueFiscal(linkId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: link } = await admin
    .from("payment_links")
    .select("id, code, sale_id, store_id")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { ok: false, error: "not_found" };
  if (!link.sale_id) return { ok: false, error: "sem_venda" };

  const { data: doc } = await admin
    .from("fiscal_documents")
    .select("id, status")
    .eq("sale_id", link.sale_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) return { ok: false, error: "sem_documento_fiscal" };

  await admin.from("fiscal_queue").insert({
    document_id: doc.id,
    last_error: "reemissao_manual",
    next_attempt_at: new Date().toISOString(),
  });
  await admin.from("fiscal_documents").update({ status: "processing" }).eq("id", doc.id);
  return { ok: true, document_id: doc.id };
}

export async function openReturn(linkId: string, reason: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: link } = await admin
    .from("payment_links")
    .select("id, code, wa_conversation_id, store_id, return_requested_at")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { ok: false, error: "not_found" };
  if (link.return_requested_at) return { ok: false, error: "ja_solicitada" };

  await admin
    .from("payment_links")
    .update({
      return_requested_at: new Date().toISOString(),
      return_reason: reason,
    })
    .eq("id", linkId);

  // Move a conversa para atendimento humano.
  if (link.wa_conversation_id) {
    await admin
      .from("wa_conversations")
      .update({
        handoff_to_human: true,
        handoff_reason: `Devolução: ${reason.slice(0, 120)}`,
        handoff_at: new Date().toISOString(),
      })
      .eq("id", link.wa_conversation_id);

    await admin.from("wa_internal_notes").insert({
      conversation_id: link.wa_conversation_id,
      note: `📮 Devolução aberta p/ pedido ${link.code}: ${reason}`,
    }).then(() => null, () => null);
  }

  const msg = `📮 Registramos sua solicitação de devolução/troca do pedido *${link.code}*.\nUma atendente humana vai te chamar em instantes para dar continuidade 💜`;
  const notify = await notifyWhatsApp(admin, link, msg, "return_opened");
  return { ok: true, notified: notify.ok, error: notify.error ?? null };
}
