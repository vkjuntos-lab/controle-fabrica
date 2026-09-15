/**
 * Webhook replay protection + consistent HMAC handling.
 *
 * All webhook handlers should:
 *  1) Verify signature (provider-specific HMAC) BEFORE parsing untrusted JSON.
 *  2) Extract a request timestamp (header or payload) and reject when older
 *     than MAX_SKEW_SEC or too far in the future.
 *
 * Fail-closed: when the required secret is not configured or the timestamp
 * is missing, verification returns false. Callers MUST return 401.
 */

export const MAX_SKEW_SEC = 300; // ±5 min tolerance window

/** Returns true when `tsSeconds` is within ±MAX_SKEW_SEC of now. */
export function isFreshTimestamp(tsSeconds: number, maxSkewSec: number = MAX_SKEW_SEC): boolean {
  if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  const drift = Math.abs(now - Math.floor(tsSeconds));
  return drift <= maxSkewSec;
}

/**
 * Best-effort freshness for Meta (WhatsApp/Instagram) payloads.
 * Meta doesn't sign a timestamp header, but every `entry` object contains a
 * `time` field (Unix seconds). We accept the payload if the *max* entry time
 * is within the skew window. When `entry[].time` is missing entirely, this
 * returns true (Meta already validated the HMAC over the raw body — the
 * signature is the primary defense; timestamp is defense in depth).
 */
export function isFreshMetaPayload(body: unknown, maxSkewSec: number = MAX_SKEW_SEC): boolean {
  try {
    const entries: any[] = Array.isArray((body as any)?.entry) ? (body as any).entry : [];
    let maxTs = 0;
    for (const e of entries) {
      const t = Number(e?.time);
      if (Number.isFinite(t) && t > maxTs) maxTs = t;
    }
    if (maxTs === 0) return true; // no timestamp in payload → rely on signature
    return isFreshTimestamp(maxTs, maxSkewSec);
  } catch {
    return false;
  }
}

/**
 * Mercado Pago signature verification.
 * Header: `x-signature: ts=<unix>,v1=<hex-sha256>`
 * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * HMAC-SHA256 with `MP_WEBHOOK_SIGNATURE_KEY` (secret from MP webhooks page).
 *
 * Returns {ok:true} only when signature matches AND `ts` is fresh.
 */
export async function verifyMercadoPagoSignature(
  request: Request,
  rawBody: string,
): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env.MP_WEBHOOK_SIGNATURE_KEY ?? "";
  const sigHeader = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";

  // If no key configured OR no signature header, fall back is caller's job.
  if (!key || !sigHeader) return { ok: false, reason: "missing_key_or_header" };

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), (v ?? "").trim()];
    }),
  ) as Record<string, string>;
  const ts = Number(parts.ts);
  const v1 = (parts.v1 ?? "").toLowerCase();
  if (!Number.isFinite(ts) || !v1) return { ok: false, reason: "malformed_header" };
  if (!isFreshTimestamp(ts)) return { ok: false, reason: "stale_timestamp" };

  // Extract data.id from body or query
  let dataId = "";
  try {
    const payload = rawBody ? JSON.parse(rawBody) : null;
    dataId = String(payload?.data?.id ?? "");
  } catch { /* ignore */ }
  if (!dataId) {
    const url = new URL(request.url);
    dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(manifest)));
  let hex = "";
  for (const b of sig) hex += b.toString(16).padStart(2, "0");
  if (hex.length !== v1.length) return { ok: false, reason: "length_mismatch" };
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return { ok: diff === 0, reason: diff === 0 ? undefined : "hmac_mismatch" };
}
