import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

import { validateWebhookSignature } from "@/lib/webhook/signature";

afterEach(() => {
  vi.unstubAllEnvs();
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("validateWebhookSignature", () => {
  it("retorna missing_secret quando WEBHOOK_SECRET não está definido", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "");
    const result = await validateWebhookSignature('{"a":1}', "abc");
    expect(result).toBe("missing_secret");
  });

  it("retorna missing_signature quando o header não existe", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "segredo");
    const result = await validateWebhookSignature('{"a":1}', null);
    expect(result).toBe("missing_signature");
  });

  it("retorna valid para assinatura correta do corpo bruto", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "segredo");
    const body = '{"a":1}';
    const sig = sign(body, "segredo");
    expect(await validateWebhookSignature(body, sig)).toBe("valid");
  });

  it("retorna invalid para assinatura incorreta", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "segredo");
    expect(await validateWebhookSignature('{"a":1}', "abcd")).toBe("invalid");
  });

  it("retorna invalid para assinatura válida de outro corpo", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "segredo");
    const sig = sign('{"a":2}', "segredo");
    expect(await validateWebhookSignature('{"a":1}', sig)).toBe("invalid");
  });
});