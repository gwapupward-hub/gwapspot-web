import assert from "node:assert/strict";
import test from "node:test";
import { computeReputationFacts, isReputationFactsV1 } from "./ppv-reputation-facts.ts";
import { chainEventId, receiptId } from "./ppv-reputation/hashing.ts";
import { PROOF_PDA, WALLET_A, WALLET_B, WALLET_C, hexFromByte, signatureFromByte } from "./ppv-reputation-test-fixtures.mjs";

function receipt(overrides) {
  const eventType = overrides.eventType ?? "settlement.completed";
  const eventId = chainEventId({ transactionSignature: overrides.sig ?? signatureFromByte(1), instructionIndex: overrides.ix ?? 0, innerInstructionIndex: 0 }, eventType);
  const holderWallet = overrides.holderWallet ?? WALLET_A;
  const role = overrides.role ?? "payee";
  return {
    schemaVersion: 1,
    receiptId: receiptId(eventId, holderWallet, role),
    eventId,
    ppvProofId: PROOF_PDA,
    proofHash: hexFromByte(4, 32),
    agreementId: null,
    holderWallet,
    holderGnsRecord: null,
    role,
    counterpartyWallets: overrides.counterparties ?? [WALLET_B],
    counterpartyGnsRecords: (overrides.counterparties ?? [WALLET_B]).map(() => null),
    sourceProduct: "sourceProduct" in overrides ? overrides.sourceProduct : "marketplace",
    sourceObjectId: "x",
    deliverableId: "y",
    eventType,
    outcome: overrides.outcome ?? "completed",
    amount: null,
    mint: null,
    programId: WALLET_C,
    transactionSignature: overrides.sig ?? signatureFromByte(1),
    instructionIndex: overrides.ix ?? 0,
    innerInstructionIndex: 0,
    completedAt: overrides.completedAt ?? "2026-01-05T00:00:00.000Z",
    sealState: overrides.sealState ?? "settled",
    disputeOpen: overrides.disputeOpen ?? false,
    mintEligible: false,
    credentialMint: null,
  };
}

test("facts count, never weigh", () => {
  const facts = computeReputationFacts(WALLET_A, [
    receipt({ sig: signatureFromByte(1) }),
    receipt({ sig: signatureFromByte(2), counterparties: [WALLET_B], completedAt: "2026-01-09T00:00:00.000Z" }),
    receipt({ sig: signatureFromByte(3), eventType: "dispute.opened", outcome: "opened", role: "collaborator", counterparties: [WALLET_C], sealState: "verified", disputeOpen: true }),
    receipt({ sig: signatureFromByte(4), eventType: "proof.created", outcome: "recorded", role: "creator", counterparties: [], sealState: "recorded", sourceProduct: null, completedAt: "2025-12-01T00:00:00.000Z" }),
    receipt({ sig: signatureFromByte(5), holderWallet: WALLET_B }), // someone else's receipt is ignored
    { junk: true },
  ]);
  assert.ok(isReputationFactsV1(facts));
  assert.equal(facts.receiptCount, 4);
  assert.equal(facts.verifiedReceiptCount, 3);
  assert.equal(facts.settledCount, 2);
  assert.equal(facts.disputesOpened, 1);
  assert.equal(facts.activeDisputes, 1);
  assert.equal(facts.distinctCounterparties, 2);
  assert.equal(facts.repeatCounterparties, 1);
  assert.equal(facts.productCounts.marketplace, 3);
  assert.equal(facts.roleCounts.payee, 2);
  assert.equal(facts.firstActivityAt, "2025-12-01T00:00:00.000Z");
  assert.equal(facts.lastActivityAt, "2026-01-09T00:00:00.000Z");
  for (const key of Object.keys(facts)) assert.ok(!/score|trust|rating|tier/i.test(key), `${key} is not a judgement`);
});
