import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  new URL("../../app/ppv/proofs/proof-actions.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../api/ppv/core/verify/route.ts", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("./core.server.ts", import.meta.url),
  "utf8",
);

test("exact evidence verification keeps plaintext browser-side", () => {
  assert.match(client, /hashText\(evidence\)/);
  assert.match(client, /hashText\(context\)/);
  assert.match(client, /JSON\.stringify\(\{ proofIdHex: normalized \}\)/);
  assert.doesNotMatch(route, /payload\.evidence/);
  assert.doesNotMatch(route, /payload\.context/);
});

test("Core verification reads the canonical proof account at finalized commitment", () => {
  assert.match(server, /getAccountInfo\(new PublicKey\(proof\), "finalized"\)/);
  assert.match(server, /WRONG_PROOF_OWNER/);
  assert.match(server, /contentHashHex/);
  assert.match(server, /contextHashHex/);
  assert.match(server, /decodeProofRecord/);
});

test("changing local proof inputs invalidates a prior VERIFIED result", () => {
  assert.match(client, /function resetLocalVerification\(\)/);
  assert.match(client, /resetLocalVerification\(\);\s*setEvidence/);
  assert.match(client, /resetLocalVerification\(\);\s*setContext/);
  assert.match(client, /resetLocalVerification\(\);\s*setProofIdHex/);
});
