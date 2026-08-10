import assert from "node:assert/strict";
import test from "node:test";
import {
  getGwapScoreLabel,
  gwapScoreFailureResult,
  mapGwapScoreTier,
  normalizeGwapIntelReport,
} from "./gwap-score.ts";

test("maps every canonical 300–900 tier boundary centrally", () => {
  assert.equal(mapGwapScoreTier(300), "High Risk");
  assert.equal(mapGwapScoreTier(499), "High Risk");
  assert.equal(mapGwapScoreTier(500), "Developing");
  assert.equal(mapGwapScoreTier(599), "Developing");
  assert.equal(mapGwapScoreTier(600), "Established");
  assert.equal(mapGwapScoreTier(699), "Established");
  assert.equal(mapGwapScoreTier(700), "Strong");
  assert.equal(mapGwapScoreTier(799), "Strong");
  assert.equal(mapGwapScoreTier(800), "Elite");
  assert.equal(mapGwapScoreTier(900), "Elite");
  assert.equal(mapGwapScoreTier(299), null);
  assert.equal(mapGwapScoreTier(901), null);
});

test("normalizes a real scored wallet report", () => {
  assert.deepEqual(
    normalizeGwapIntelReport({
      totalTx: 82,
      trust: { score: 742, rating: "legacy-label" },
    }),
    {
      status: "scored",
      score: 742,
      tier: "Strong",
      message: "GwapScore 742 · Strong",
    },
  );
});

test("reports insufficient-history wallets as Unscored, never zero", () => {
  const result = normalizeGwapIntelReport({
    totalTx: 0,
    trust: { score: 300, insufficientData: true },
  });
  assert.equal(result.status, "unscored");
  assert.equal(result.score, null);
  assert.equal(result.tier, null);
  assert.equal(getGwapScoreLabel(result), "Unscored");
});

test("reports timeout placeholders and invalid scores as Unavailable", () => {
  const timeout = normalizeGwapIntelReport({
    partialProfile: true,
    trust: { score: 300, modelVersion: "partial-timeout" },
  });
  const invalid = normalizeGwapIntelReport({
    totalTx: 4,
    trust: { score: 0 },
  });
  assert.equal(timeout.status, "unavailable");
  assert.equal(timeout.score, null);
  assert.equal(invalid.status, "unavailable");
  assert.equal(invalid.score, null);
  assert.equal(getGwapScoreLabel(invalid), "Unavailable");
});

test("maps API failure and timeout errors to explicit Unavailable states", () => {
  const timeoutError = new Error("aborted");
  timeoutError.name = "AbortError";
  const apiFailure = gwapScoreFailureResult(503);
  const timeout = gwapScoreFailureResult(timeoutError);

  assert.equal(apiFailure.status, "unavailable");
  assert.equal(apiFailure.score, null);
  assert.match(apiFailure.message, /error \(503\)/);
  assert.equal(timeout.status, "unavailable");
  assert.equal(timeout.score, null);
  assert.match(timeout.message, /timed out/);
});
