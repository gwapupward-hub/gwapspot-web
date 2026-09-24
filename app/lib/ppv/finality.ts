export type PpvSignatureStatusLike = {
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  err?: unknown;
};

export type PpvFinalityState = "pending" | "failed" | "finalized";

export function classifyPpvSignatureFinality(
  status: PpvSignatureStatusLike | null | undefined,
): PpvFinalityState {
  if (!status) return "pending";
  if (status.err !== null && status.err !== undefined) return "failed";
  return status.confirmationStatus === "finalized" ? "finalized" : "pending";
}
