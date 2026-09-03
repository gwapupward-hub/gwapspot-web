import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChainEvent, normalizeProductSubmission } from "./ppv-reputation/normalize.ts";
import { receiptId } from "./ppv-reputation/hashing.ts";
import { ReputationProjection, toVerifiedActivityItem } from "./ppv-reputation-projection.ts";
import {
  AGREEMENT_PDA,
  FIXTURES,
  MemoryStorage,
  PROGRAM_IDS,
  PROOF_PDA,
  WALLET_A,
  WALLET_B,
  WALLET_C,
  hexFromByte,
  signatureFromByte,
  snapshot,
} from "./ppv-reputation-test-fixtures.mjs";

function directoryResolver(entries) {
  const directory = new Map(entries);
  return async (wallet) => {
    const name = directory.get(wallet);
    return name ? snapshot(name, wallet) : null;
  };
}

const verifierAlive = async (subjectId) => ({
  exists: true,
  revoked: false,
  authority: WALLET_A,
  contentHash: hexFromByte(4, 32),
  checkedAt: new Date().toISOString(),
  subjectId,
});

function envelope(event, overrides = {}) {
  return {
    event,
    programId: event.name.startsWith("Proof") ? PROGRAM_IDS.ppvCore : PROGRAM_IDS.ppvCommerce,
    transactionSignature: signatureFromByte(40),
    instructionIndex: 0,
    innerInstructionIndex: 0,
    blockTime: 1_700_000_100,
    ...overrides,
  };
}

async function normalize(event, resolveGns, overrides) {
  return normalizeChainEvent(envelope(event, overrides), { resolveGns, expectedProgramIds: PROGRAM_IDS });
}

test("duplicate webhook: replaying a transaction stores one event and one receipt per participant", async () => {
  const storage = new MemoryStorage();
  const projection = new ReputationProjection(storage, verifierAlive);
  const resolveGns = directoryResolver([[WALLET_A, "emerald"], [WALLET_B, "onyx"]]);
  const event = await normalize(FIXTURES.agreementExecuted, resolveGns);

  const first = await projection.ingest(event);
  const writesAfterFirst = storage.writes;
  const second = await projection.ingest(event);
  const third = await projection.ingest(await normalize(FIXTURES.agreementExecuted, resolveGns));

  assert.equal(first.stored, true);
  assert.equal(second.stored, false);
  assert.equal(third.stored, false);
  assert.deepEqual(second.receiptIds, first.receiptIds);
  assert.deepEqual(third.receiptIds, first.receiptIds);
  assert.equal((await projection.listSubjectEvents(AGREEMENT_PDA)).length, 1);
  assert.equal((await projection.listWalletReceipts(WALLET_A)).length, 1);
  assert.equal((await projection.listWalletReceipts(WALLET_B)).length, 1);
  const facts = await projection.getFacts(WALLET_A);
  assert.equal(facts.receiptCount, 1);
  assert.equal(facts.eventCounts["agreement.executed"], 1);
  assert.ok(storage.writes > writesAfterFirst, "replays refresh state but never add rows");
});

test("out-of-order delivery converges to the same seal state and receipts", async () => {
  const resolveGns = directoryResolver([[WALLET_A, "emerald"], [WALLET_B, "onyx"]]);
  const sig = (n) => signatureFromByte(50 + n);
  const created = await normalize(FIXTURES.agreementCreated, resolveGns, { transactionSignature: sig(0) });
  const signed = await normalize(FIXTURES.agreementSigned, resolveGns, { transactionSignature: sig(1), innerInstructionIndex: 0 });
  const executed = await normalize(FIXTURES.agreementExecuted, resolveGns, { transactionSignature: sig(1), innerInstructionIndex: 1 });

  const inOrder = new ReputationProjection(new MemoryStorage(), verifierAlive);
  for (const e of [created, signed, executed]) await inOrder.ingest(e);
  const reversed = new ReputationProjection(new MemoryStorage(), verifierAlive);
  for (const e of [executed, signed, created]) await reversed.ingest(e);

  const strip = (receipts) => receipts.map((r) => ({ ...r })).sort((a, b) => a.receiptId.localeCompare(b.receiptId));
  assert.deepEqual(strip(await inOrder.listWalletReceipts(WALLET_A)), strip(await reversed.listWalletReceipts(WALLET_A)));
  assert.deepEqual(strip(await inOrder.listWalletReceipts(WALLET_B)), strip(await reversed.listWalletReceipts(WALLET_B)));
  for (const receipt of await reversed.listSubjectReceipts(AGREEMENT_PDA)) {
    assert.equal(receipt.sealState, "counterparty_confirmed");
  }
  assert.equal((await reversed.listSubjectReceipts(AGREEMENT_PDA)).length, 6);
});

test("identity: emerald.gwap moving to wallet B leaves wallet A's history with wallet A", async () => {
  const projection = new ReputationProjection(new MemoryStorage(), verifierAlive);
  const before = directoryResolver([[WALLET_A, "emerald"]]);
  const event = await normalize(FIXTURES.proofCreated, before, { transactionSignature: signatureFromByte(60) });
  await projection.ingest(event);

  // Transfer: emerald.gwap now belongs to wallet B, and B records new activity.
  const after = directoryResolver([[WALLET_B, "emerald"]]);
  const laterEvent = await normalize(
    { ...FIXTURES.proofCreated, proof: WALLET_C, authority: WALLET_B },
    after,
    { transactionSignature: signatureFromByte(61) },
  );
  await projection.ingest(laterEvent);
  // A dropped-and-replayed webhook for the old transaction with the new directory changes nothing.
  await projection.ingest(await normalize(FIXTURES.proofCreated, after, { transactionSignature: signatureFromByte(60) }));

  const walletA = await projection.listWalletReceipts(WALLET_A);
  assert.equal(walletA.length, 1);
  assert.equal(walletA[0].holderGnsRecord.fullName, "emerald.gwap");
  assert.equal(walletA[0].holderGnsRecord.owner, WALLET_A);

  const walletB = await projection.listWalletReceipts(WALLET_B);
  assert.equal(walletB.length, 1);
  assert.equal(walletB[0].holderGnsRecord.owner, WALLET_B);

  // Activity recorded under the name lists both eras, each attributed to the wallet that held it.
  const underName = await projection.listNameReceipts("emerald");
  assert.deepEqual(underName.map((r) => r.holderWallet).sort(), [WALLET_A, WALLET_B].sort());
  assert.equal(underName.find((r) => r.holderWallet === WALLET_A).holderGnsRecord.owner, WALLET_A);
});

test("receipts: multiple participants and a participant without GNS", async () => {
  const projection = new ReputationProjection(new MemoryStorage(), verifierAlive);
  const resolveGns = directoryResolver([[WALLET_A, "emerald"]]);
  const event = await normalize(FIXTURES.agreementExecuted, resolveGns, { transactionSignature: signatureFromByte(70) });
  const result = await projection.ingest(event);
  assert.equal(result.receiptIds.length, 2);
  const a = await projection.getReceipt(receiptId(event.eventId, WALLET_A, "collaborator"));
  const b = await projection.getReceipt(receiptId(event.eventId, WALLET_B, "collaborator"));
  assert.equal(a.holderGnsRecord.fullName, "emerald.gwap");
  assert.equal(b.holderGnsRecord, null);
  assert.deepEqual(b.counterpartyGnsRecords[0].fullName, "emerald.gwap");
  assert.equal((await projection.listNameReceipts("emerald")).length, 1);
  const item = toVerifiedActivityItem(b);
  assert.equal(item.role, "collaborator");
  assert.ok(!("score" in item));
});

test("proof.submitted from a product is idempotent and marketplace roles are hinted", async () => {
  const storage = new MemoryStorage();
  const resolveGns = directoryResolver([[WALLET_A, "emerald"], [WALLET_B, "onyx"]]);
  const reference = {
    schemaVersion: 1,
    sourceProduct: "marketplace",
    sourceObjectId: "intent_1",
    deliverableId: "milestone-0",
    creatorWallet: WALLET_A,
    creatorGnsRecord: snapshot("emerald", WALLET_A),
    ppvProofId: PROOF_PDA,
    proofHash: hexFromByte(4, 32),
    createdAt: "2026-02-01T00:00:00.000Z",
    counterpartyWallet: WALLET_B,
    deliverableKind: "milestone",
  };
  const projection = new ReputationProjection(storage, verifierAlive, async (event) =>
    event.ppvProofId === PROOF_PDA ? { [WALLET_A]: "seller", [WALLET_B]: "buyer" } : {},
  );
  const registered = await projection.registerDeliverableReference(reference);
  assert.equal(registered.stored, true);
  assert.equal((await projection.registerDeliverableReference({ ...reference, deliverableId: "other" })).stored, false, "one proof anchors one deliverable");

  const created = await normalize(FIXTURES.proofCreated, resolveGns, { transactionSignature: signatureFromByte(80) });
  await projection.ingest(created);
  const submission = normalizeProductSubmission({ reference, proofCreated: created, submittedAt: reference.createdAt, counterpartyGnsRecord: snapshot("onyx", WALLET_B) });
  const first = await projection.ingest(submission);
  const second = await projection.ingest(submission);
  assert.equal(first.stored, true);
  assert.equal(second.stored, false);
  const seller = await projection.getReceipt(receiptId(submission.eventId, WALLET_A, "seller"));
  const buyer = await projection.getReceipt(receiptId(submission.eventId, WALLET_B, "buyer"));
  assert.ok(seller && buyer);
  assert.equal(seller.sourceProduct, "marketplace");
  assert.equal((await projection.listWalletReceipts(WALLET_B)).length, 1);
  const facts = await projection.getFacts(WALLET_A);
  assert.equal(facts.productCounts.marketplace, 1);
  assert.equal(facts.eventCounts["proof.submitted"], 1);
});

test("revocation and chain verification drive seal state across every receipt on the subject", async () => {
  const resolveGns = directoryResolver([[WALLET_A, "emerald"]]);
  let exists = false;
  const projection = new ReputationProjection(new MemoryStorage(), async () => ({
    exists,
    revoked: false,
    authority: WALLET_A,
    contentHash: hexFromByte(4, 32),
    checkedAt: new Date(0).toISOString(),
  }));
  const created = await normalize(FIXTURES.proofCreated, resolveGns, { transactionSignature: signatureFromByte(90) });
  const result = await projection.ingest(created);
  assert.equal(result.sealState, "recorded", "not yet re-read from chain");

  exists = true;
  await projection.verifySubject(PROOF_PDA, "proof", { force: true });
  const revoked = await normalize(FIXTURES.proofRevoked, resolveGns, { transactionSignature: signatureFromByte(91) });
  const revokedResult = await projection.ingest(revoked);
  assert.equal(revokedResult.sealState, "revoked");
  for (const receipt of await projection.listSubjectReceipts(PROOF_PDA)) assert.equal(receipt.sealState, "revoked");
  const facts = await projection.getFacts(WALLET_A);
  assert.equal(facts.revokedProofs, 1);
});

test("the projection refuses to store anything that fails contract validation", async () => {
  const projection = new ReputationProjection(new MemoryStorage(), verifierAlive);
  await assert.rejects(projection.ingest({ schemaVersion: 1, eventId: "evt_bad" }), TypeError);
  await assert.rejects(projection.registerDeliverableReference({ schemaVersion: 1 }), TypeError);
});
