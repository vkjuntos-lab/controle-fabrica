/** Server adapter contract. No vendor, endpoint or credentials are configured by this module. */
export type FiscalEnvironment = "HOMOLOGATION" | "PRODUCTION";
export type RemoteResult =
  | { status: "PROCESSING"; remoteId: string }
  | { status: "REJECTED"; code: string }
  | {
      status: "AUTHORIZED";
      remoteId: string;
      accessKey: string;
      protocol: string;
      authorizedAt: string;
      officialXml: string;
    }
  | { status: "NOT_FOUND" };
export interface FiscalProviderAdapter {
  readonly environment: FiscalEnvironment;
  readonly code: string;
  submit(request: { idempotencyKey: string; preparedPayload: string }): Promise<RemoteResult>;
  queryStatus?(idempotencyKey: string): Promise<RemoteResult>;
  cancel?(request: {
    remoteId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<RemoteResult>;
  downloadXml?(remoteId: string): Promise<string>;
  downloadPdf?(remoteId: string): Promise<Uint8Array>;
}
export type Attempt = {
  idempotencyKey: string;
  environment: FiscalEnvironment;
  preparedPayload: string;
  previouslyAttempted: boolean;
};
export type TransmissionOutcome = {
  state: "PROCESSING" | "REJECTED" | "PENDING_EVIDENCE" | "PENDING_REMOTE_QUERY";
  result?: RemoteResult;
};
/** Caller must persist/lock an attempt before entering; this function never asserts official authorization.
 * A separate vendor-specific verifier must authenticate and archive official evidence before AUTHORIZED.
 * No registered adapter exists, and this coordinator is deliberately not wired to a public endpoint.
 */
export async function coordinateTransmission(
  adapter: FiscalProviderAdapter,
  attempt: Attempt,
): Promise<TransmissionOutcome> {
  if (adapter.environment !== attempt.environment)
    throw new Error("Ambientes fiscais incompatíveis.");
  try {
    let result: RemoteResult;
    if (attempt.previouslyAttempted) {
      if (!adapter.queryStatus) return { state: "PENDING_REMOTE_QUERY" };
      result = await adapter.queryStatus(attempt.idempotencyKey);
      // Even NOT_FOUND may be eventual consistency. Human reconciliation is required; never resubmit automatically.
      if (result.status === "NOT_FOUND") return { state: "PENDING_REMOTE_QUERY", result };
    } else {
      result = await adapter.submit({
        idempotencyKey: attempt.idempotencyKey,
        preparedPayload: attempt.preparedPayload,
      });
    }
    if (result.status === "AUTHORIZED") {
      if (
        !result.protocol.trim() ||
        !/^\d{44}$/.test(result.accessKey) ||
        !result.officialXml.trim() ||
        !Number.isFinite(Date.parse(result.authorizedAt))
      )
        throw new Error("Evidência oficial incompleta.");
      return { state: "PENDING_EVIDENCE", result };
    }
    return {
      state:
        result.status === "REJECTED"
          ? "REJECTED"
          : result.status === "PROCESSING"
            ? "PROCESSING"
            : "PENDING_REMOTE_QUERY",
      result,
    };
  } catch {
    // Transport errors and incomplete evidence are not fiscal rejection.
    return { state: "PENDING_REMOTE_QUERY" };
  }
}
