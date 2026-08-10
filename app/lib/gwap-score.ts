export const GWAP_SCORE_MIN = 300;
export const GWAP_SCORE_MAX = 900;

export const GWAP_SCORE_TIERS = [
  { min: 300, max: 499, label: "High Risk" },
  { min: 500, max: 599, label: "Developing" },
  { min: 600, max: 699, label: "Established" },
  { min: 700, max: 799, label: "Strong" },
  { min: 800, max: 900, label: "Elite" },
] as const;

export type GwapScoreTier = (typeof GWAP_SCORE_TIERS)[number]["label"];
export type GwapScoreStatus = "scored" | "unscored" | "unavailable";

export type GwapScoreResult = {
  status: GwapScoreStatus;
  score: number | null;
  tier: GwapScoreTier | null;
  message: string;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function mapGwapScoreTier(score: number): GwapScoreTier | null {
  if (!Number.isInteger(score)) return null;
  return (
    GWAP_SCORE_TIERS.find(({ min, max }) => score >= min && score <= max)
      ?.label ?? null
  );
}

export function scoredGwapScore(score: number): GwapScoreResult {
  const tier = mapGwapScoreTier(score);
  if (!tier) return unavailableGwapScore("The score response was invalid.");
  return {
    status: "scored",
    score,
    tier,
    message: `GwapScore ${score} · ${tier}`,
  };
}

export function unscoredGwapScore(
  message = "This wallet has not received a protocol score yet.",
): GwapScoreResult {
  return { status: "unscored", score: null, tier: null, message };
}

export function unavailableGwapScore(
  message = "The scoring service is temporarily unavailable.",
): GwapScoreResult {
  return { status: "unavailable", score: null, tier: null, message };
}

export function gwapScoreFailureResult(failure: unknown): GwapScoreResult {
  if (typeof failure === "number") {
    return unavailableGwapScore(
      `The scoring service returned an error (${failure}).`,
    );
  }
  if (failure instanceof Error && failure.name === "AbortError") {
    return unavailableGwapScore("The scoring request timed out. Try again shortly.");
  }
  return unavailableGwapScore("The scoring service could not be reached.");
}

/**
 * Converts the canonical gwap-intel report into the only score shape used by
 * GwapSpot and GwapOS. Partial timeout reports and insufficient-history reports
 * deliberately never become a displayed score of 0 or 300.
 */
export function normalizeGwapIntelReport(value: unknown): GwapScoreResult {
  const root = asRecord(value);
  const payload = asRecord(root?.data) || root;
  const trust = asRecord(payload?.trust);

  if (!payload) return unavailableGwapScore("The score response was invalid.");
  if (payload.partialProfile === true) {
    return unavailableGwapScore(
      "Scoring timed out before a complete protocol score was available.",
    );
  }
  if (!trust) {
    return unscoredGwapScore();
  }
  if (trust.insufficientData === true || asNumber(payload.totalTx) === 0) {
    return unscoredGwapScore(
      "This wallet does not have enough on-chain history to be scored.",
    );
  }

  const score = asNumber(trust.score);
  if (score === null || !Number.isInteger(score)) return unscoredGwapScore();
  return scoredGwapScore(score);
}

export function getGwapScoreLabel(result: Pick<GwapScoreResult, "status" | "score">) {
  if (result.status === "scored" && result.score !== null) {
    return String(result.score);
  }
  return result.status === "unscored" ? "Unscored" : "Unavailable";
}
