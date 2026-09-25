import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const harness = readFileSync(
  new URL("../../../scripts/ppv-commerce-localnet.mjs", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../../../.github/workflows/ppv-commerce-localnet.yml", import.meta.url),
  "utf8",
);

test("Commerce localnet gate uses the pinned canonical SDK builders", () => {
  assert.match(harness, /buildCreateCommerceAgreementInstruction/);
  assert.match(harness, /buildReviseCommerceAgreementInstruction/);
  assert.match(harness, /buildSignCommerceAgreementInstruction/);
  assert.match(harness, /buildCreateProofInstruction/);
  assert.match(harness, /decodeAgreement/);
  assert.match(harness, /decodeProofRecord/);
});

test("Commerce localnet gate covers C01-C04 and finalized local-validator evidence", () => {
  for (const id of ["C01", "C02", "C03", "C04"]) {
    assert.match(harness, new RegExp(`${id}: "PASS"`));
  }
  assert.match(harness, /commitment: "finalized"/);
  assert.match(harness, /preflightCommitment: "finalized"/);
  assert.match(harness, /genesisHash/);
  assert.match(harness, /signatures/);
});

test("expensive Anchor localnet gate is manual-only and pins the PPV package", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.match(
    workflow,
    /ref: 7c4ea67a9b6d69ab85a20f497eb0c2a31b48cfd2/,
  );
  assert.match(workflow, /solana-test-validator/);
});
