import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura HMAC-SHA256 para webhooks. Espera-se que o remetente assine o
 * corpo bruto da requisição e envie em `x-webhook-signature` como hex.
 *
 * O segredo é lido de `WEBHOOK_SECRET` (variável de ambiente). Enquanto não
 * estiver configurado, webhooks estão desabilitados por padrão.
 */
export async function validateWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<"valid" | "missing_secret" | "invalid" | "missing_signature"> {
  const secret = process.env["WEBHOOK_SECRET"];
  if (!secret) return "missing_secret";

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (!signatureHeader) return "missing_signature";

  const provided = Buffer.from(signatureHeader, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (provided.length !== expectedBuf.length) return "invalid";

  return timingSafeEqual(provided, expectedBuf) ? "valid" : "invalid";
}