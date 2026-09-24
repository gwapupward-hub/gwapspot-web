import assert from "node:assert/strict";
import test from "node:test";
import {
  PPV_CORE_PROOF_ACCOUNT_BYTES,
  PPV_CORE_PROOF_KINDS,
  bytesToLowerHex,
  fixedHexToBytes,
  isPpvCoreProofKind,
} from "./core.ts";
import { PPV_DEPLOYMENT_MANIFEST } from "./deployment-manifest.ts";

test("Core proof account size stays pinned to the deployed Anchor schema", () => {
  assert.equal(PPV_CORE_PROOF_ACCOUNT_BYTES, 204);
});

test("Core proof kinds are explicit and stable", () => {
  assert.deepEqual(PPV_CORE_PROOF_KINDS, [
    "creation",
    "document",
    "agreement",
    "invoice",
    "deliverable",
    "other",
  ]);
  assert.equal(isPpvCoreProofKind("document"), true);
  assert.equal(isPpvCoreProofKind("unknown"), false);
});

test("fixed hex parsing round trips exact proof identifiers and hashes", () => {
  const proofId = "ab".repeat(16);
  const hash = "01".repeat(32);
  assert.equal(bytesToLowerHex(fixedHexToBytes(proofId, 16, "proofId")), proofId);
  assert.equal(bytesToLowerHex(fixedHexToBytes(hash, 32, "hash")), hash);
});

test("fixed hex parsing rejects malformed or wrong-length values", () => {
  assert.throws(() => fixedHexToBytes("aa", 16, "proofId"));
  assert.throws(() => fixedHexToBytes("zz".repeat(16), 16, "proofId"));
});

test("Core devnet deployment is the only mutation-approved PPV program", () => {
  assert.equal(PPV_DEPLOYMENT_MANIFEST.reviewStatus, "APPROVED_DEVNET_INTEGRATION");
  assert.equal(PPV_DEPLOYMENT_MANIFEST.programs.core.mutationApproved, true);
  assert.equal(PPV_DEPLOYMENT_MANIFEST.programs.commerce.mutationApproved, false);
  assert.equal(PPV_DEPLOYMENT_MANIFEST.programs.escrow.mutationApproved, false);
  assert.equal(
    PPV_DEPLOYMENT_MANIFEST.programs.core.programDataAddress,
    "FfEQrpiQSzxUErCBkXCukbt26JivKiExA6HswMpQkiSA",
  );
  assert.equal(PPV_DEPLOYMENT_MANIFEST.programs.core.deploymentSlot, 497437304);
});
