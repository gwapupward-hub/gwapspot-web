import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("PPV Core returns from wallet broadcast before waiting on Privy confirmation polling", () => {
  const client = read("../../app/ppv/proofs/proof-actions.tsx");
  assert.match(client, /optimisticBroadcast:\s*true/);
  assert.match(client, /skipSimulation:\s*true/);
  assert.match(client, /reportPpvClientEvent\("broadcast_returned"/);
  assert.match(client, /reportPpvClientEvent\("confirm_started"/);
});

test("PPV Core rejects a wallet handoff that returns without a usable signature", () => {
  const client = read("../../app/ppv/proofs/proof-actions.tsx");
  assert.match(client, /PPV_WALLET_SIGNATURE_MISSING/);
  assert.match(client, /MISSING_SIGNATURE/);
  assert.match(client, /result\?\.signature instanceof Uint8Array/);
  assert.match(client, /wallet\.standardWallet\.name/);
});

test("PPV Core simulates the exact prepared transaction before wallet handoff", () => {
  const server = read("../core.server.ts");
  assert.match(server, /simulateTransaction\(transaction\)/);
  assert.match(server, /TRANSACTION_SIMULATION_FAILED/);
  assert.match(server, /ppv_core_preflight_failed/);
});

test("PPV client diagnostics never accept raw transaction or identity material", () => {
  const route = read("../../api/ppv/core/diagnostics/route.ts");
  assert.match(route, /ALLOWED_EVENTS/);
  assert.doesNotMatch(route, /signature:/);
  assert.doesNotMatch(route, /walletAddress/);
  assert.doesNotMatch(route, /transactionBase64/);
  assert.doesNotMatch(route, /contentHash/);
});
