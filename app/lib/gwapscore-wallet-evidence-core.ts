export const GWAPSCORE_TX_ACTIVITY_CAP = 1_000;
export const GWAPSCORE_WALLET_AGE_CAP_DAYS = 730;
export const GWAPSCORE_SIGNATURE_PAGE_SIZE = 1_000;
export const GWAPSCORE_MAX_SIGNATURES_SCANNED = 5_000;

export type WalletSignatureEvidence = {
  signature: string;
  blockTime: number | null;
};

export type WalletSignaturePageFetcher = (input: {
  before?: string;
  limit: number;
}) => Promise<WalletSignatureEvidence[]>;

export type WalletHistoryEvidence = {
  txCount: number;
  walletAgeDays: number;
  scannedSignatures: number;
  oldestObservedBlockTime: number | null;
  historyExhausted: boolean;
  scoringBoundsSatisfied: boolean;
  evidenceCompleteForScoring: boolean;
  stopReason: "history_exhausted" | "scoring_bounds_satisfied" | "scan_budget_exhausted";
};

export type GwapScoreWalletEvidencePayload = {
  subjectId: string;
  walletAddress: string;
  walletAgeDays: number;
  txCount: number;
  ownershipVerified: true;
};

export function buildGwapScoreWalletEvidencePayload(input: {
  subjectId: string;
  verifiedWallet: string;
  evidence: Pick<WalletHistoryEvidence, "walletAgeDays" | "txCount">;
}): GwapScoreWalletEvidencePayload {
  return {
    subjectId: input.subjectId,
    walletAddress: input.verifiedWallet,
    walletAgeDays: input.evidence.walletAgeDays,
    txCount: input.evidence.txCount,
    ownershipVerified: true,
  };
}

function ageDaysFromBlockTime(blockTime: number | null, nowMs: number) {
  if (blockTime === null || !Number.isFinite(blockTime)) return 0;
  return Math.max(0, Math.floor((nowMs - blockTime * 1_000) / 86_400_000));
}

/**
 * Collect only the amount of wallet history required by the current GwapScore
 * alpha wallet model.
 *
 * Evidence is complete for scoring when either:
 * 1. the RPC history is exhausted, so observed tx count/age are complete; or
 * 2. both scoring saturation bounds are proven (>=1,000 tx and >=730 days).
 *
 * If the scan budget is exhausted first, callers must not submit the partial
 * evidence to GwapScore because doing so could unfairly understate reputation.
 */
export async function collectWalletHistoryEvidence(
  fetchPage: WalletSignaturePageFetcher,
  options: {
    nowMs?: number;
    pageSize?: number;
    maxSignatures?: number;
  } = {},
): Promise<WalletHistoryEvidence> {
  const nowMs = options.nowMs ?? Date.now();
  const pageSize = Math.max(1, Math.min(GWAPSCORE_SIGNATURE_PAGE_SIZE, options.pageSize ?? GWAPSCORE_SIGNATURE_PAGE_SIZE));
  const maxSignatures = Math.max(pageSize, options.maxSignatures ?? GWAPSCORE_MAX_SIGNATURES_SCANNED);

  let before: string | undefined;
  let scannedSignatures = 0;
  let oldestObservedBlockTime: number | null = null;

  while (scannedSignatures < maxSignatures) {
    const remaining = maxSignatures - scannedSignatures;
    const limit = Math.min(pageSize, remaining);
    const page = await fetchPage({ before, limit });

    if (page.length === 0) {
      const walletAgeDays = ageDaysFromBlockTime(oldestObservedBlockTime, nowMs);
      return {
        txCount: scannedSignatures,
        walletAgeDays,
        scannedSignatures,
        oldestObservedBlockTime,
        historyExhausted: true,
        scoringBoundsSatisfied:
          scannedSignatures >= GWAPSCORE_TX_ACTIVITY_CAP &&
          walletAgeDays >= GWAPSCORE_WALLET_AGE_CAP_DAYS,
        evidenceCompleteForScoring: true,
        stopReason: "history_exhausted",
      };
    }

    scannedSignatures += page.length;
    for (const item of page) {
      if (item.blockTime === null || !Number.isFinite(item.blockTime)) continue;
      if (oldestObservedBlockTime === null || item.blockTime < oldestObservedBlockTime) {
        oldestObservedBlockTime = item.blockTime;
      }
    }

    const walletAgeDays = ageDaysFromBlockTime(oldestObservedBlockTime, nowMs);
    const scoringBoundsSatisfied =
      scannedSignatures >= GWAPSCORE_TX_ACTIVITY_CAP &&
      walletAgeDays >= GWAPSCORE_WALLET_AGE_CAP_DAYS;

    if (scoringBoundsSatisfied) {
      return {
        txCount: scannedSignatures,
        walletAgeDays,
        scannedSignatures,
        oldestObservedBlockTime,
        historyExhausted: false,
        scoringBoundsSatisfied: true,
        evidenceCompleteForScoring: true,
        stopReason: "scoring_bounds_satisfied",
      };
    }

    // A short page means getSignaturesForAddress reached the end of history.
    if (page.length < limit) {
      return {
        txCount: scannedSignatures,
        walletAgeDays,
        scannedSignatures,
        oldestObservedBlockTime,
        historyExhausted: true,
        scoringBoundsSatisfied: false,
        evidenceCompleteForScoring: true,
        stopReason: "history_exhausted",
      };
    }

    before = page.at(-1)?.signature;
    if (!before) break;
  }

  const walletAgeDays = ageDaysFromBlockTime(oldestObservedBlockTime, nowMs);
  return {
    txCount: scannedSignatures,
    walletAgeDays,
    scannedSignatures,
    oldestObservedBlockTime,
    historyExhausted: false,
    scoringBoundsSatisfied:
      scannedSignatures >= GWAPSCORE_TX_ACTIVITY_CAP &&
      walletAgeDays >= GWAPSCORE_WALLET_AGE_CAP_DAYS,
    evidenceCompleteForScoring: false,
    stopReason: "scan_budget_exhausted",
  };
}
