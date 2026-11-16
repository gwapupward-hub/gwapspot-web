export const PUBLIC_LOOKUP_EVENT = "gwap:public-lookup";

export type PublicLookupMode = "wallet" | "name";

export type PublicLookupOutcome =
  | "name_available"
  | "name_registered"
  | "identity_found"
  | "wallet_no_identity"
  | "wallet_score_only"
  | "source_unavailable"
  | "invalid_input"
  | "lookup_error";

type PublicLookupSummary =
  | { kind: "name"; available: boolean }
  | {
      kind: "wallet";
      identity: {
        status: "found" | "none" | "unavailable";
        scoreStatus: "scored" | "unscored" | "unavailable";
      };
    };

export type PublicLookupEventDetail =
  | { phase: "started"; attempt: number; mode: PublicLookupMode }
  | {
      phase: "completed" | "recovered";
      attempt: number;
      mode: PublicLookupMode;
      outcome: PublicLookupOutcome;
    };

export function classifyPublicLookupResult(result: PublicLookupSummary): PublicLookupOutcome {
  if (result.kind === "name") {
    return result.available ? "name_available" : "name_registered";
  }

  if (result.identity.status === "found") return "identity_found";
  if (result.identity.status === "none") return "wallet_no_identity";
  if (result.identity.scoreStatus !== "unavailable") return "wallet_score_only";
  return "source_unavailable";
}

export function isMeaningfulPublicLookupOutcome(outcome: PublicLookupOutcome) {
  return !["source_unavailable", "invalid_input", "lookup_error"].includes(outcome);
}
