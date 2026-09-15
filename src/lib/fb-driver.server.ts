// Server-only: Facebook Graph API driver (Messenger send, Page publish, comment reply).
export type FbCredentials = {
  fb_token: string | null;
  fb_page_id?: string | null;
  fb_active?: boolean | null;
};

type SendResult = { ok: boolean; provider?: string; messageId?: string; error?: string };
const GRAPH_VERSION = "v21.0";

/** Envia DM no Messenger da Página. `to` = PSID do usuário do Messenger. */
export async function sendMessengerMessage(
  creds: FbCredentials,
  to: string,
  text: string,
): Promise<SendResult> {
  if (!creds?.fb_token) return { ok: false, provider: "messenger", error: "Missing fb_token" };
  if (!creds?.fb_page_id) return { ok: false, provider: "messenger", error: "Missing fb_page_id" };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.fb_page_id}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.fb_token}` },
      body: JSON.stringify({
        recipient: { id: to },
        message: { text: text.slice(0, 1990) },
        messaging_type: "RESPONSE",
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) return { ok: false, provider: "messenger", error: `HTTP ${res.status}: ${bodyText.slice(0, 300)}` };
    let parsed: any = {};
    try { parsed = JSON.parse(bodyText); } catch { /* ignore */ }
    return { ok: true, provider: "messenger", messageId: parsed?.message_id ?? undefined };
  } catch (e) {
    return { ok: false, provider: "messenger", error: (e as Error).message };
  }
}

/** Publica um post no feed da Página. `link` opcional. Retorna post id. */
export async function publishPagePost(
  creds: FbCredentials,
  params: { message: string; link?: string | null; published?: boolean; scheduled_publish_time?: number | null },
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!creds?.fb_token || !creds?.fb_page_id) return { ok: false, error: "Missing credentials" };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.fb_page_id}/feed`;
  const body: Record<string, unknown> = { message: params.message };
  if (params.link) body.link = params.link;
  if (params.published === false) body.published = false;
  if (params.scheduled_publish_time) {
    body.published = false;
    body.scheduled_publish_time = params.scheduled_publish_time;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.fb_token}` },
      body: JSON.stringify(body),
    });
    const t = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 300)}` };
    const parsed = JSON.parse(t);
    return { ok: true, postId: parsed?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Publica uma foto (por URL) no feed da Página. */
export async function publishPagePhoto(
  creds: FbCredentials,
  params: { imageUrl: string; caption?: string; published?: boolean },
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!creds?.fb_token || !creds?.fb_page_id) return { ok: false, error: "Missing credentials" };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.fb_page_id}/photos`;
  const body: Record<string, unknown> = { url: params.imageUrl };
  if (params.caption) body.caption = params.caption;
  if (params.published === false) body.published = false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.fb_token}` },
      body: JSON.stringify(body),
    });
    const t = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 300)}` };
    const parsed = JSON.parse(t);
    return { ok: true, postId: parsed?.post_id ?? parsed?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Responde a um comentário de post. `commentId` é o id do comentário-alvo. */
export async function replyToComment(
  creds: FbCredentials,
  commentId: string,
  message: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!creds?.fb_token) return { ok: false, error: "Missing fb_token" };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${commentId}/comments`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.fb_token}` },
      body: JSON.stringify({ message: message.slice(0, 8000) }),
    });
    const t = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 300)}` };
    const parsed = JSON.parse(t);
    return { ok: true, id: parsed?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Lista posts recentes da Página. */
export async function listPagePosts(
  creds: FbCredentials,
  limit = 20,
): Promise<{ ok: boolean; posts?: any[]; error?: string }> {
  if (!creds?.fb_token || !creds?.fb_page_id) return { ok: false, error: "Missing credentials" };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.fb_page_id}/posts?fields=id,message,created_time,permalink_url,is_published&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.fb_token}` } });
    const t = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 300)}` };
    const parsed = JSON.parse(t);
    return { ok: true, posts: parsed?.data ?? [] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
