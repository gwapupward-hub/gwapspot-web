import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChainEvent, normalizeProductSubmission } from "./ppv-reputation/normalize.ts";
import { isReputationEventV1 } from "./ppv-reputation/contracts.ts";
import { evaluateCredentialEligibility } from "./ppv-reputation/eligibility.ts";
import { ReputationProjection, toVerifiedActivityItem } from "./ppv-reputation-projection.ts";
import { computeReputationFacts, isReputationFactsV1 } from "./ppv-reputation-facts.ts";
import { assertCallerIsCreator, assertChainMatchesDraft, DeliverableRegistrationError } from "./ppv-deliverable-authority.ts";
import {
  AGREEMENT_PDA,
  FIXTURES,
  MemoryStorage,
  PROGRAM_IDS,
  PROOF_PDA,
  WALLET_A,
  WALLET_B,
  hexFromByte,
  signatureFromByte,
  snapshot,
} from "./ppv-reputation-test-fixtures.mjs";

/**
 * One deterministic run of the real golden path this pipeline supports today:
 *
 *   seller creates a proof (deliverable evidence)
 *   -> buyer & seller create + sign an agreement (the job)
 *   -> seller anchors the proof as a marketplace deliverable against it
 *   -> the agreement executes (payment/settlement stand-in; see note below)
 *   -> receipts land for both parties
 *   -> GwapScore's facts input is computed from those receipts
 *   -> GNS Verified Activity items are built from the same receipts
 *
 * It exercises the production ReputationProjection/normalize/receipts code
 * used by the real webhook (ppv-reputation-server.ts), swapping only the
 * network edges: Redis -> MemoryStorage, Solana RPC -> a fixed verifier,
 * GNS HTTP -> an in-memory directory. Everything else is the real pipeline.
 *
 * NOTE ON SCOPE: `milestone.*`, `invoice.paid`, `dispute.*` and
 * `settlement.completed` are declared in the shared contract (see
 * docs/reputation-events-v1.md in gwapupward-hub/ppv) but are only ever
 * produced by custody programs that do not exist yet. `agreement.executed`
 * is the real, chain-emitted event closest to "milestone completed /
 * payment released" today, and it is as far up the seal-state ladder
 * (`counterparty_confirmed`) as any real event can currently drive a
 * receipt. Reaching `settled` (and therefore credential eligibility) needs
 * one of those still-unbuilt programs; this test asserts that boundary
 * explicitly rather than fabricating a settlement event no program emits.
 */

function directoryResolver(entries) {
  const directory = new Map(entries);
  return async (wallet) => {
    const name = directory.get(wallet);
    return name ? snapshot(name, wallet) : null;
  };
}

function envelope(event, overrides = {}) {
  return {
    event,
    programId: event.name.startsWith("Proof") ? PROGRAM_IDS.ppvCore : PROGRAM_IDS.ppvCommerce,
    transactionSignature: signatureFromByte(120),
    instructionIndex: 0,
    innerInstructionIndex: 0,
    blockTime: 1_700_000_100,
    ...overrides,
  };
}

async function normalize(event, resolveGns, overrides) {
  return normalizeChainEvent(envelope(event, overrides), { resolveGns, expectedProgramIds: PROGRAM_IDS });
}

test("golden path: agreement -> proof -> deliverable -> execution -> receipts -> GwapScore facts -> GNS activity", async () => {
  const storage = new MemoryStorage();
  const chainState = { proofExists: false, proofRevoked: false, proofAuthority: WALLET_A, proofContentHash: hexFromByte(4, 32) };
  const verifier = async (subjectId, kind) => {
    if (kind === "proof") {
      return {
        exists: chainState.proofExists,
        revoked: chainState.proofRevoked,
        authority: chainState.proofAuthority,
        contentHash: chainState.proofContentHash,
        checkedAt: new Date().toISOString(),
      };
    }
    return { exists: true, revoked: false, authority: WALLET_A, contentHash: hexFromByte(4, 32), checkedAt: new Date().toISOString() };
  };
  const roleHints = async (event) => {
    if (event.ppvProofId !== PROOF_PDA) return {};
    const reference = await projection.getDeliverableReference(PROOF_PDA);
    if (!reference || !reference.counterpartyWallet) return {};
    return { [reference.creatorWallet]: "seller", [reference.counterpartyWallet]: "buyer" };
  };
  const projection = new ReputationProjection(storage, verifier, roleHints);
  const resolveGns = directoryResolver([[WALLET_A, "emerald"], [WALLET_B, "onyx"]]);

  // 1. Seller (WALLET_A) creates the PPV proof that anchors the deliverable.
  const proofCreated = await normalize(FIXTURES.proofCreated, resolveGns, { transactionSignature: signatureFromByte(101) });
  assert.ok(isReputationEventV1(proofCreated));
  await projection.ingest(proofCreated);
  chainState.proofExists = true; // the proof account now exists on chain

  // 2. Buyer and seller create and sign the agreement (the job).
  const agreementCreated = await normalize(FIXTURES.agreementCreated, resolveGns, { transactionSignature: signatureFromByte(102) });
  await projection.ingest(agreementCreated);
  const agreementSigned = await normalize(FIXTURES.agreementSigned, resolveGns, { transactionSignature: signatureFromByte(103) });
  await projection.ingest(agreementSigned);

  // 3. Seller anchors the proof as a marketplace deliverable against the job.
  //    This is the server boundary a client cannot spoof: reject a caller who
  //    is not the proof's authority, and reject a client-claimed authority or
  //    content hash that does not match what is actually on chain.
  const draft = {
    schemaVersion: 1,
    sourceProduct: "marketplace",
    sourceObjectId: "job_1",
    deliverableId: "milestone-1",
    creatorWallet: WALLET_A,
    ppvProofId: PROOF_PDA,
    proofHash: hexFromByte(4, 32),
    counterpartyWallet: WALLET_B,
    deliverableKind: "milestone",
  };
  assert.throws(() => assertCallerIsCreator(draft, WALLET_B), DeliverableRegistrationError, "buyer cannot anchor a deliverable it did not create");
  const forgedHashDraft = { ...draft, proofHash: hexFromByte(9, 32) };
  const chainNow = await projection.verifySubject(PROOF_PDA, "proof", { force: true });
  assert.throws(() => assertChainMatchesDraft(forgedHashDraft, chainNow, WALLET_A), DeliverableRegistrationError, "a forged proof hash is rejected against the on-chain commitment");
  assert.throws(() => assertChainMatchesDraft(draft, chainNow, WALLET_B), DeliverableRegistrationError, "a caller impersonating the on-chain authority is rejected");
  assertCallerIsCreator(draft, WALLET_A);
  assertChainMatchesDraft(draft, chainNow, WALLET_A);

  const creatorGnsRecord = await resolveGns(WALLET_A);
  const counterpartyGnsRecord = await resolveGns(WALLET_B);
  const reference = { ...draft, creatorGnsRecord, createdAt: "2026-02-01T00:00:00.000Z" };
  const registered = await projection.registerDeliverableReference(reference);
  assert.equal(registered.stored, true);
  const submission = normalizeProductSubmission({ reference: registered.reference, proofCreated, submittedAt: reference.createdAt, counterpartyGnsRecord });
  await projection.ingest(submission);

  // 4. The agreement executes: the real, chain-emitted stand-in for
  //    "milestone completed / payment released" until a custody program for
  //    those event types exists (see the file-level note above).
  const agreementExecuted = await normalize(FIXTURES.agreementExecuted, resolveGns, { transactionSignature: signatureFromByte(104) });
  const executedResult = await projection.ingest(agreementExecuted);
  assert.equal(executedResult.sealState, "counterparty_confirmed", "real events today cannot reach `settled` without a custody program");

  // 5. Duplicate delivery of the whole story changes nothing already stored.
  const receiptCountBeforeReplay = (await projection.listSubjectReceipts(AGREEMENT_PDA)).length;
  await projection.ingest(await normalize(FIXTURES.agreementExecuted, resolveGns, { transactionSignature: signatureFromByte(104) }));
  await projection.ingest(submission);
  assert.equal((await projection.listSubjectReceipts(AGREEMENT_PDA)).length, receiptCountBeforeReplay, "replays never add rows");

  // 6. Receipts exist for both parties and reference the same agreement id
  //    (IDs stay identical across every consumer that reads this receipt).
  const sellerReceipts = await projection.listWalletReceipts(WALLET_A);
  const buyerReceipts = await projection.listWalletReceipts(WALLET_B);
  assert.ok(sellerReceipts.length >= 2 && buyerReceipts.length >= 1);
  for (const receipt of [...sellerReceipts, ...buyerReceipts]) {
    if (receipt.eventType === "agreement.executed") assert.equal(receipt.agreementId, AGREEMENT_PDA);
  }

  // 7. GwapScore's ingestion boundary: facts are counted, never weighed, and
  //    match the schema GwapScore's PpvFactsClient validates on read
  //    (schemaVersion === 1, wallet field present) before it touches scoring.
  const sellerFacts = computeReputationFacts(WALLET_A, sellerReceipts);
  assert.ok(isReputationFactsV1(sellerFacts));
  assert.equal(sellerFacts.schemaVersion, 1);
  assert.equal(sellerFacts.wallet, WALLET_A);
  assert.equal(sellerFacts.counterpartyConfirmedCount, 1);
  assert.equal(sellerFacts.eventCounts["agreement.executed"], 1);
  assert.equal(sellerFacts.eventCounts["proof.submitted"], 1);
  assert.ok(!("score" in sellerFacts) && !("trustScore" in sellerFacts), "PPV never emits a score; only GwapScore may");

  // 8. GNS Verified Activity reads the same receipts and shows facts, not a
  //    judgement: no scoring field ever reaches that surface either.
  const buyerItem = toVerifiedActivityItem(buyerReceipts.find((r) => r.eventType === "agreement.executed"));
  assert.equal(buyerItem.agreementId, AGREEMENT_PDA);
  assert.equal(buyerItem.holderGnsRecord.fullName, "onyx.gwap");
  assert.deepEqual(buyerItem.counterpartyGnsRecords.map((r) => r?.fullName).filter(Boolean), ["emerald.gwap"]);
  assert.ok(!("score" in buyerItem));

  // 9. Credential/NFT eligibility correctly refuses to mint before the
  //    lifecycle reaches `settled` -- there is no real settlement yet.
  const sellerAgreementReceipt = sellerReceipts.find((r) => r.eventType === "agreement.executed");
  const eligibility = evaluateCredentialEligibility({
    receipt: sellerAgreementReceipt,
    requestedBy: WALLET_A,
    proof: { exists: true, revoked: false, authority: WALLET_A, contentHash: hexFromByte(4, 32) },
    facts: await projection.sealFactsFor(AGREEMENT_PDA, "agreement"),
  });
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes("not_settled"), "no real settlement event exists yet, so nothing is eligible to mint");
});
