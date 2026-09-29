import { describe, it, expect, vi } from "vitest";
import { coordinateTransmission, type FiscalProviderAdapter } from "./provider";
const attempt = {
  idempotencyKey: "same-request",
  environment: "HOMOLOGATION" as const,
  preparedPayload: "fixture",
  previouslyAttempted: false,
};
describe("fiscal provider coordination contract", () => {
  it("queries after timeout without issuing another document", async () => {
    const adapter: FiscalProviderAdapter = {
      code: "TEST_ONLY",
      environment: "HOMOLOGATION",
      submit: vi.fn().mockRejectedValue(new Error("timeout")),
      queryStatus: vi.fn().mockResolvedValue({ status: "PROCESSING", remoteId: "one" }),
    };
    expect((await coordinateTransmission(adapter, attempt)).state).toBe("PENDING_REMOTE_QUERY");
    expect(
      (await coordinateTransmission(adapter, { ...attempt, previouslyAttempted: true })).state,
    ).toBe("PROCESSING");
    expect(adapter.submit).toHaveBeenCalledTimes(1);
    expect(adapter.queryStatus).toHaveBeenCalledWith("same-request");
  });
  it("does not resubmit when query is unsupported or inconclusive", async () => {
    const adapter: FiscalProviderAdapter = {
      code: "TEST_ONLY",
      environment: "HOMOLOGATION",
      submit: vi.fn(),
    };
    expect(
      (await coordinateTransmission(adapter, { ...attempt, previouslyAttempted: true })).state,
    ).toBe("PENDING_REMOTE_QUERY");
    adapter.queryStatus = vi.fn().mockResolvedValue({ status: "NOT_FOUND" });
    await coordinateTransmission(adapter, { ...attempt, previouslyAttempted: true });
    expect(adapter.submit).not.toHaveBeenCalled();
  });
  it("rejects production/homologation mismatch before transport", async () => {
    const adapter: FiscalProviderAdapter = {
      code: "TEST_ONLY",
      environment: "PRODUCTION",
      submit: vi.fn(),
    };
    await expect(coordinateTransmission(adapter, attempt)).rejects.toThrow("Ambientes");
    expect(adapter.submit).not.toHaveBeenCalled();
  });
  it("requires verification and archival even when provider claims authorization", async () => {
    const adapter: FiscalProviderAdapter = {
      code: "TEST_ONLY",
      environment: "HOMOLOGATION",
      submit: vi.fn().mockResolvedValue({
        status: "AUTHORIZED",
        remoteId: "one",
        protocol: "fixture",
        accessKey: "1".repeat(44),
        authorizedAt: "2026-09-29T12:00:00Z",
        officialXml: "<fixture/>",
      }),
    };
    expect((await coordinateTransmission(adapter, attempt)).state).toBe("PENDING_EVIDENCE");
  });
});
