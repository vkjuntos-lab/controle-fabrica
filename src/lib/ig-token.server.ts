// Server-only: troca / renovação de tokens do Instagram Graph API.
// Docs Meta: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived

export type RefreshResult =
  | { ok: true; token: string; expiresIn: number | null }
  | { ok: false; error: string };

/**
 * Troca um token (curto ou long-lived) por um long-lived (~60 dias).
 * Requer META app_id e app_secret; se não houver appId configurado por loja,
 * usa process.env.META_APP_ID como fallback.
 */
export async function refreshIgLongLivedToken(params: {
  token: string;
  appId: string;
  appSecret: string;
}): Promise<RefreshResult> {
  if (!params.token) return { ok: false, error: "missing_token" };
  if (!params.appId) return { ok: false, error: "missing_app_id" };
  if (!params.appSecret) return { ok: false, error: "missing_app_secret" };

  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("fb_exchange_token", params.token);

  try {
    const r = await fetch(url.toString(), { method: "GET" });
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok || !body?.access_token) {
      const msg = body?.error?.message ?? `HTTP ${r.status}`;
      return { ok: false, error: msg };
    }
    return {
      ok: true,
      token: body.access_token as string,
      expiresIn: typeof body.expires_in === "number" ? body.expires_in : null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
