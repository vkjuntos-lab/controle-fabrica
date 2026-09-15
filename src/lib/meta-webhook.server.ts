/**
 * Verify Meta (WhatsApp/Instagram Cloud API) webhook signature.
 *
 * Meta signs POST payloads with `X-Hub-Signature-256: sha256=<hex>` using
 * HMAC-SHA256 of the *raw* request body with the app secret. Callers MUST
 * pass the raw body text (not the parsed JSON) so bytes match exactly.
 *
 * Returns true only when META_APP_SECRET is configured and the signature
 * matches. Returns false otherwise (fail-closed).
 */
export async function verifyMetaSignature(request: Request, rawBody: string): Promise<boolean> {
  // Cada app da Meta tem seu próprio App Secret. Aceitamos secrets alternativos
  // para quando WhatsApp e Instagram estiverem em apps diferentes.
  const secrets = [
    process.env.META_APP_SECRET,
    process.env.WA_APP_SECRET,
    process.env.IG_APP_SECRET,
  ].filter((s): s is string => !!s && s.length > 0);
  if (secrets.length === 0) return false;
  const header = request.headers.get("x-hub-signature-256") ?? "";
  const m = /^sha256=([a-f0-9]+)$/i.exec(header.trim());
  if (!m) return false;
  const provided = m[1].toLowerCase();

  const enc = new TextEncoder();
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const bytes = new Uint8Array(sig);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    if (hex.length !== provided.length) continue;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
    if (diff === 0) return true;
  }
  return false;
}

