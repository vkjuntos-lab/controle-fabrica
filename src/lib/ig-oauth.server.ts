// Server-only: Instagram Business Login (OAuth) helpers.
// Fluxo: /oauth/authorize -> code -> token curto -> token long-lived (60d).

const enc = new TextEncoder();

export function igAppId(): string {
  return process.env.IG_APP_ID ?? process.env.META_APP_ID ?? "";
}

export function igAppSecret(): string {
  return process.env.IG_APP_SECRET ?? process.env.META_APP_SECRET ?? "";
}

function stateSecret(): string {
  return igAppSecret() || process.env.CRON_SECRET || "ks-ig-oauth-fallback";
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

/** Cria um `state` assinado (HMAC) contendo a loja + timestamp. */
export async function signState(storeId: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ s: storeId, t: Date.now() })));
  const sig = b64url(await hmac(payload, stateSecret()));
  return `${payload}.${sig}`;
}

/** Valida o `state`; retorna o storeId ou null. Expira em 30 min. */
export async function verifyState(state: string | null): Promise<string | null> {
  if (!state || !state.includes(".")) return null;
  const [payload, sig] = state.split(".");
  const expected = b64url(await hmac(payload!, stateSecret()));
  if (!sig || sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(fromB64url(payload!))) as { s?: string; t?: number };
    if (!obj?.s || !obj?.t) return null;
    if (Date.now() - obj.t > 30 * 60 * 1000) return null;
    return obj.s;
  } catch {
    return null;
  }
}

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", igAppId());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPES.join(","));
  u.searchParams.set("state", state);
  // Business Login puro (sem tela do Facebook) e sempre pedindo autenticação.
  u.searchParams.set("enable_fb_login", "0");
  u.searchParams.set("force_authentication", "1");
  return u.toString();
}


export type ExchangeResult =
  | { ok: true; token: string; userId: string | null; expiresIn: number | null }
  | { ok: false; error: string };

/** Troca o `code` por token curto e, em seguida, por long-lived (~60 dias). */
export async function exchangeCodeForLongLivedToken(
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  if (!igAppId()) return { ok: false, error: "missing_app_id" };
  if (!igAppSecret()) return { ok: false, error: "missing_app_secret" };

  const form = new URLSearchParams({
    client_id: igAppId(),
    client_secret: igAppSecret(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  let shortToken = "";
  let userId: string | null = null;
  try {
    const r = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok || !body?.access_token) {
      return { ok: false, error: body?.error_message ?? body?.error?.message ?? `HTTP ${r.status}` };
    }
    shortToken = body.access_token as string;
    userId = body.user_id != null ? String(body.user_id) : null;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Long-lived (60 dias)
  try {
    const u = new URL("https://graph.instagram.com/access_token");
    u.searchParams.set("grant_type", "ig_exchange_token");
    u.searchParams.set("client_secret", igAppSecret());
    u.searchParams.set("access_token", shortToken);
    const r = await fetch(u.toString());
    const body: any = await r.json().catch(() => ({}));
    if (r.ok && body?.access_token) {
      return {
        ok: true,
        token: body.access_token as string,
        userId,
        expiresIn: typeof body.expires_in === "number" ? body.expires_in : null,
      };
    }
  } catch {
    /* segue com token curto */
  }
  return { ok: true, token: shortToken, userId, expiresIn: null };
}

/** Busca o ID da conta do Instagram usando o token. */
export async function fetchIgUserId(token: string): Promise<string | null> {
  try {
    const r = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
    const body: any = await r.json().catch(() => ({}));
    return body?.id ? String(body.id) : null;
  } catch {
    return null;
  }
}

/** Valida o `signed_request` enviado pela Meta em deauthorize / data-deletion. */
export async function parseSignedRequest(signed: string): Promise<Record<string, any> | null> {
  if (!signed || !signed.includes(".")) return null;
  const [sigPart, payloadPart] = signed.split(".");
  const secret = igAppSecret();
  if (!secret) return null;
  const expected = b64url(await hmac(payloadPart!, secret));
  const provided = (sigPart ?? "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromB64url(payloadPart!)));
  } catch {
    return null;
  }
}
