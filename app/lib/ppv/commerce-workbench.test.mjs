import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  new URL("../../app/ppv/agreements/agreement-actions.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../app/ppv/agreements/page.tsx", import.meta.url),
  "utf8",
);
const readiness = readFileSync(
  new URL("./readiness.server.ts", import.meta.url),
  "utf8",
);
const diagnostics = readFileSync(
  new URL("../../api/ppv/commerce/diagnostics/route.ts", import.meta.url),
  "utf8",
);

test("Commerce workbench hashes content and terms in the browser", () => {
  assert.match(client, /hashDocumentHexV1/);
  assert.match(client, /localHashes\(content, terms\)/);
  assert.match(client, /contentHashHex: hashes\.contentHashHex/);
  assert.match(client, /termsHashHex: hashes\.termsHashHex/);
  assert.doesNotMatch(client, /JSON\.stringify\(\{ action, content, terms/);
});

test("signing requires an exact local review of the current version", () => {
  assert.match(client, /reviewState !== "match"/);
  assert.match(client, /reviewedVersion !== record\.version/);
  assert.match(client, /hashes\.contentHashHex !== record\.contentHash/);
  assert.match(client, /hashes\.termsHashHex !== record\.termsHash/);
  assert.match(client, /Review current version/);
  assert.match(client, /Sign exact current version/);
});

test("Commerce wallet flow keeps simulation and hands finality to GWAP", () => {
  assert.match(client, /chain: prepared\.chain/);
  assert.match(client, /optimisticBroadcast: true/);
  assert.match(client, /skipSimulation: false/);
  assert.match(client, /\/api\/ppv\/commerce\/confirm/);
  assert.match(client, /Retry finalized verification/);
});

test("Commerce UX keeps Phantom devnet context explicit", () => {
  assert.match(client, /Testnet Mode → Solana Devnet/);
  assert.match(client, /PPV COMMERCE · SOLANA DEVNET/);
});

test("Commerce remains capability-gated until deployment readiness opens", () => {
  assert.match(client, /const writesReady = mutationCapability\.state === "ready"/);
  assert.match(client, /!writesReady/);
  assert.match(page, /readiness\.actions\["agreement\.create"\]/);
  assert.match(readiness, /"agreement\.revise": mutations\.commerce/);
  assert.match(readiness, /"agreement\.cancel": mutations\.commerce/);
});

test("Commerce client telemetry is bounded and excludes transaction material", () => {
  assert.match(diagnostics, /ALLOWED_ACTIONS/);
  assert.doesNotMatch(diagnostics, /signature:/);
  assert.doesNotMatch(diagnostics, /walletAddress/);
  assert.doesNotMatch(diagnostics, /transactionBase64/);
  assert.doesNotMatch(diagnostics, /contentHash/);
  assert.doesNotMatch(diagnostics, /termsHash/);
});
