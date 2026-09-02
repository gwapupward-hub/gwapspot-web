import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliverableAdapterError,
  buildDailyIdeasDeliverableReference,
  buildDeliverableReferenceFromRequest,
  buildDimiDeliverableReference,
  buildMarketplaceDeliverableReference,
  finalizeDeliverableReference,
} from "./ppv-deliverable-adapters.ts";
import { isGwapDeliverableReferenceV1 } from "./ppv-reputation/contracts.ts";
import { PROOF_PDA, WALLET_A, WALLET_B, hexFromByte } from "./ppv-reputation-test-fixtures.mjs";

const proof = { ppvProofId: PROOF_PDA, proofHash: hexFromByte(4, 32), counterpartyWallet: WALLET_B };

test("marketplace anchors delivered or accepted milestones only", () => {
  const draft = buildMarketplaceDeliverableReference({ intentId: "intent_1", milestoneIndex: 2, state: "accepted", creatorWallet: WALLET_A, proof });
  assert.equal(draft.deliverableId, "milestone-2");
  assert.equal(draft.deliverableKind, "milestone");
  assert.throws(() => buildMarketplaceDeliverableReference({ intentId: "intent_1", milestoneIndex: null, state: "draft", creatorWallet: WALLET_A, proof }), DeliverableAdapterError);
  assert.throws(() => buildMarketplaceDeliverableReference({ intentId: "intent_1", milestoneIndex: -1, state: "accepted", creatorWallet: WALLET_A, proof }), DeliverableAdapterError);
  assert.throws(() => buildMarketplaceDeliverableReference({ intentId: "intent_1", milestoneIndex: null, state: "accepted", creatorWallet: WALLET_A, proof: { ...proof, counterpartyWallet: WALLET_A } }), /differ/);
  const full = finalizeDeliverableReference(draft, null, "2026-01-01T00:00:00.000Z");
  assert.ok(isGwapDeliverableReferenceV1(full));
});

test("daily ideas anchors launched projects and done tasks, never drafts", () => {
  assert.equal(buildDailyIdeasDeliverableReference({ kind: "project", projectId: "project_a", status: "launched", creatorWallet: WALLET_A, proof }).deliverableKind, "project-launch");
  assert.equal(buildDailyIdeasDeliverableReference({ kind: "task", projectId: "project_a", taskId: "t1", status: "done", creatorWallet: WALLET_A, proof }).deliverableId, "task-t1");
  assert.throws(() => buildDailyIdeasDeliverableReference({ kind: "project", projectId: "project_a", status: "developing", creatorWallet: WALLET_A, proof }), /launched/);
  assert.throws(() => buildDailyIdeasDeliverableReference({ kind: "task", projectId: "project_a", taskId: "t1", status: "in_progress", creatorWallet: WALLET_A, proof }), /completed/);
});

test("dimi anchors finalized masters, accepted contributions, signed deliverables and releases", () => {
  assert.equal(buildDimiDeliverableReference({ kind: "master", projectId: "track_1", deliverableId: "master-v3", status: "finalized", creatorWallet: WALLET_A, proof }).deliverableKind, "master");
  assert.equal(buildDimiDeliverableReference({ kind: "contribution", projectId: "track_1", deliverableId: "verse-2", status: "accepted", creatorWallet: WALLET_A, proof }).sourceProduct, "dimi");
  assert.throws(() => buildDimiDeliverableReference({ kind: "master", projectId: "track_1", deliverableId: "m", status: "draft", creatorWallet: WALLET_A, proof }), /finalized/);
  assert.throws(() => buildDimiDeliverableReference({ kind: "contribution", projectId: "track_1", deliverableId: "c", status: "submitted", creatorWallet: WALLET_A, proof }), /accepted/);
  assert.throws(() => buildDimiDeliverableReference({ kind: "stem", projectId: "track_1", deliverableId: "c", status: "finalized", creatorWallet: WALLET_A, proof }), /Unknown/);
});

test("request bodies route to adapters and unknown products are refused", () => {
  const body = { sourceProduct: "dimi", kind: "release", projectId: "album_1", deliverableId: "release-1", status: "released", proof: { ppvProofId: PROOF_PDA, proofHash: hexFromByte(4, 32).toUpperCase() } };
  const draft = buildDeliverableReferenceFromRequest(body, WALLET_A);
  assert.equal(draft.proofHash, hexFromByte(4, 32));
  assert.equal(draft.counterpartyWallet, null);
  assert.throws(() => buildDeliverableReferenceFromRequest({ sourceProduct: "gwapos" }, WALLET_A), /Unsupported/);
  assert.throws(() => buildDeliverableReferenceFromRequest({ ...body, proof: { ppvProofId: "nope", proofHash: "x" } }, WALLET_A), /proof id/);
});
