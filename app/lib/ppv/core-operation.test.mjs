import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Core prepare requests are deduplicated through a server operation ledger", () => {
  const ledger = read("./core-operation.server.ts");
  assert.match(ledger, /setIfAbsent\(/);
  assert.match(ledger, /INTENT_RESERVATION_TTL_SECONDS/);
  assert.match(ledger, /ppv-core-operation/);
  assert.match(ledger, /ppv-core-intent/);
  assert.match(ledger, /operationId/);
});

test("Core confirmation binds to the persisted operation when available", () => {
  const ledger = read("./core-operation.server.ts");
  assert.match(ledger, /OPERATION_SIGNATURE_MISMATCH/);
  assert.match(ledger, /record\.prepared\.lastValidBlockHeight/);
  assert.match(ledger, /status: result\.status === "finalized" \? "finalized" : "submitted"/);
});

test("the proof client persists the server operation id and server-selected proof id", () => {
  const client = read("../../app/ppv/proofs/proof-actions.tsx");
  assert.match(client, /operationId: prepared\.operationId/);
  assert.match(client, /proofIdHex: prepared\.proofIdHex/);
  assert.match(client, /operationId: pending\.operationId/);
});
