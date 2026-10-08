import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGwapScoreWalletEvidencePayload,
  collectWalletHistoryEvidence,
  GWAPSCORE_TX_ACTIVITY_CAP,
  GWAPSCORE_WALLET_AGE_CAP_DAYS,
} from "./gwapscore-wallet-evidence-core.ts";

const DAY = 86_400;
const NOW_MS = Date.UTC(2026, 9, 7);
const NOW_SECONDS = Math.floor(NOW_MS / 1000);

function signature(index, ageDays) {
  return {
    signature: `sig-${index}`,
    blockTime: NOW_SECONDS - ageDays * DAY,
  };
}

test("wallet evidence payload keeps canonical GWAP subject separate from wallet", () => {
  const payload = buildGwapScoreWalletEvidencePayload({
    subjectId: "gwap_canonicalAccount123",
    verifiedWallet: "11111111111111111111111111111111111111111111",
    evidence: {
      walletAgeDays: 400,
      txCount: 700,
    },
  });

  assert.equal(payload.subjectId, "gwap_canonicalAccount123");
  assert.equal(payload.walletAddress, "11111111111111111111111111111111111111111111");
  assert.notEqual(payload.subjectId, payload.walletAddress);
  assert.equal(payload.ownershipVerified, true);
  assert.equal(payload.walletAgeDays, 400);
  assert.equal(payload.txCount, 700);
});

test("small exhausted wallet produces complete conservative evidence", async () => {
  const pages = [
    [signature(1, 3), signature(2, 40), signature(3, 120)],
  ];
  let calls = 0;

  const result = await collectWalletHistoryEvidence(
    async () => pages[calls++] ?? [],
    { nowMs: NOW_MS, pageSize: 100 },
  );

  assert.equal(result.txCount, 3);
  assert.equal(result.walletAgeDays, 120);
  assert.equal(result.historyExhausted, true);
  assert.equal(result.evidenceCompleteForScoring, true);
  assert.equal(result.stopReason, "history_exhausted");
});

test("stops once both GwapScore saturation bounds are proven", async () => {
  let pageNumber = 0;
  const result = await collectWalletHistoryEvidence(
    async ({ limit }) => {
      pageNumber += 1;
      const start = (pageNumber - 1) * limit;
      return Array.from({ length: limit }, (_, offset) => {
        const index = start + offset + 1;
        const ageDays = pageNumber === 2 && offset === limit - 1 ? 800 : 20;
        return signature(index, ageDays);
      });
    },
    { nowMs: NOW_MS, pageSize: 500, maxSignatures: 5_000 },
  );

  assert.equal(result.txCount, GWAPSCORE_TX_ACTIVITY_CAP);
  assert.ok(result.walletAgeDays >= GWAPSCORE_WALLET_AGE_CAP_DAYS);
  assert.equal(result.scoringBoundsSatisfied, true);
  assert.equal(result.evidenceCompleteForScoring, true);
  assert.equal(result.stopReason, "scoring_bounds_satisfied");
  assert.equal(pageNumber, 2);
});

test("refuses to call a truncated scan complete when age evidence is unresolved", async () => {
  let pageNumber = 0;
  const result = await collectWalletHistoryEvidence(
    async ({ limit }) => {
      pageNumber += 1;
      const start = (pageNumber - 1) * limit;
      return Array.from({ length: limit }, (_, offset) => signature(start + offset + 1, 90));
    },
    { nowMs: NOW_MS, pageSize: 1_000, maxSignatures: 2_000 },
  );

  assert.equal(result.txCount, 2_000);
  assert.equal(result.walletAgeDays, 90);
  assert.equal(result.historyExhausted, false);
  assert.equal(result.evidenceCompleteForScoring, false);
  assert.equal(result.stopReason, "scan_budget_exhausted");
});

test("ignores missing block times without inventing wallet age", async () => {
  const result = await collectWalletHistoryEvidence(
    async () => [
      { signature: "sig-1", blockTime: null },
      { signature: "sig-2", blockTime: null },
    ],
    { nowMs: NOW_MS, pageSize: 100 },
  );

  assert.equal(result.txCount, 2);
  assert.equal(result.walletAgeDays, 0);
  assert.equal(result.evidenceCompleteForScoring, true);
});
