// Server-only: Instagram Messaging driver via Graph API (me/messages).
// Envia mensagens de texto para uma conversa do Instagram Direct.

export type IgCredentials = {
  ig_token: string | null;
  ig_user_id?: string | null;
  ig_page_id?: string | null;
  ig_active?: boolean | null;
};

type SendResult = { ok: boolean; provider?: string; messageId?: string; error?: string };

const GRAPH_VERSION = "v21.0";

/**
 * Envia mensagem via Instagram Messaging API.
 * `to` = IGSID (Instagram-scoped user id) do destinatário.
 * Requer `ig_token` (Page Access Token) e `ig_user_id` (IG Business/Pro user id).
 */
export async function sendInstagramMessage(
  creds: IgCredentials,
  to: string,
  text: string,
): Promise<SendResult> {
  if (!creds?.ig_token) return { ok: false, provider: "instagram", error: "Missing ig_token" };
  if (!creds?.ig_user_id) return { ok: false, provider: "instagram", error: "Missing ig_user_id" };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.ig_user_id}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.ig_token}`,
      },
      body: JSON.stringify({
        recipient: { id: to },
        message: { text: text.slice(0, 990) }, // IG limita ~1000 chars por msg
        messaging_type: "RESPONSE",
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      return { ok: false, provider: "instagram", error: `HTTP ${res.status}: ${bodyText.slice(0, 300)}` };
    }
    let parsed: any = {};
    try { parsed = JSON.parse(bodyText); } catch { /* ignore */ }
    return { ok: true, provider: "instagram", messageId: parsed?.message_id ?? undefined };
  } catch (e) {
    return { ok: false, provider: "instagram", error: (e as Error).message };
  }
}
