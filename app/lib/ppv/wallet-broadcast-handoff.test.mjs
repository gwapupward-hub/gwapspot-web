import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("PPV Core returns from wallet broadcast before waiting on Privy confirmation polling", () => {
  const client = read("../../app/ppv/proofs/proof-actions.tsx");
  assert.match(client, /optimisticBroadcast:\s*true/);
  assert.match(client, /reportPpvClientEvent\("broadcast_returned"/);
  assert.match(client, /reportPpvClientEvent\("confirm_started"/);
});

test("PPV client diagnostics never accept raw transaction or identity material", () => {
  const route = read("../../api/ppv/core/diagnostics/route.ts");
  assert.match(route, /ALLOWED_EVENTS/);
  assert.doesNotMatch(route, /signature:/);
  assert.doesNotMatch(route, /walletAddress/);
  assert.doesNotMatch(route, /transactionBase64/);
  assert.doesNotMatch(route, /contentHash/);
});
