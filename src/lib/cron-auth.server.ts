/**
 * Shared authentication helper for public cron endpoints.
 *
 * Cron jobs must present the shared MP_WEBHOOK_SECRET (or, when set, the
 * dedicated CRON_SECRET) either via:
 *   - Header `x-cron-secret: <secret>`
 *   - Header `authorization: Bearer <secret>`
 *   - Query string `?secret=<secret>`
 *
 * The Supabase publishable/anon key is NOT accepted — it is a public value
 * shipped to every browser and therefore not a credential.
 */
export function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET ?? "";
  const mpSecret = process.env.MP_WEBHOOK_SECRET ?? "";
  const accepted = [cronSecret, mpSecret].filter((s) => s.length > 0);
  if (accepted.length === 0) return false;

  const url = new URL(request.url);
  const provided = new Set<string>();
  const qs = url.searchParams.get("secret");
  if (qs) provided.add(qs);
  const hdr = request.headers.get("x-cron-secret");
  if (hdr) provided.add(hdr);
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) provided.add(m[1].trim());

  for (const p of provided) {
    for (const a of accepted) {
      if (p === a) return true;
    }
  }
  return false;
}
