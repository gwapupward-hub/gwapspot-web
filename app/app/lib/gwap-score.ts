import {
  normalizeGwapIntelReport,
  gwapScoreFailureResult,
  unscoredGwapScore,
  type GwapScoreResult,
} from "../../lib/gwap-score";

const DEFAULT_GWAP_INTEL_API_URL = "https://gwap-intel.onrender.com";
const DEFAULT_SCORE_TIMEOUT_MS = 4_500;
const MAX_SCORE_TIMEOUT_MS = 15_000;

function getGwapIntelApiBase() {
  return (process.env.GWAP_INTEL_API_URL || DEFAULT_GWAP_INTEL_API_URL).replace(
    /\/+$/,
    "",
  );
}

export async function fetchGwapScore(
  wallet: string,
  options: { timeoutMs?: number } = {},
): Promise<GwapScoreResult> {
  const requestedTimeout = options.timeoutMs ?? DEFAULT_SCORE_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(requestedTimeout, 1_000), MAX_SCORE_TIMEOUT_MS)
    : DEFAULT_SCORE_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${getGwapIntelApiBase()}/intel/profile/${encodeURIComponent(wallet)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );

    if (response.status === 404) return unscoredGwapScore();
    if (!response.ok) {
      return gwapScoreFailureResult(response.status);
    }
    return normalizeGwapIntelReport(await response.json());
  } catch (error) {
    return gwapScoreFailureResult(error);
  } finally {
    clearTimeout(timeout);
  }
}
