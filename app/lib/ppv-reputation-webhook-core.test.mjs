import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { encodeBase58 } from "./ppv-reputation/base58.ts";
import { EVENT_IX_TAG } from "./ppv-reputation/chain-events.ts";
import {
  parseHeliusWebhookPayload,
  parseRawTransaction,
  verifyStaticAuthorization,
  verifyWebhookHmac,
} from "./ppv-reputation-webhook-core.ts";
import { encodePpvEvent, walletFromByte, signatureFromByte, FIXTURES, PROGRAM_IDS } from "./ppv-reputation-test-fixtures.mjs";

const SECRET = "0123456789abcdef0123456789abcdef";

test("HMAC verification uses the raw body bytes and accepts hex or base64url", () => {
  const raw = Buffer.from('[{"signature":"x",  "k": 1}]');
  const hex = createHmac("sha256", SECRET).update(raw).digest("hex");
  const b64 = createHmac("sha256", SECRET).update(raw).digest("base64url");
  assert.equal(verifyWebhookHmac(raw, hex, SECRET), true);
  assert.equal(verifyWebhookHmac(raw, `sha256=${hex}`, SECRET), true);
  assert.equal(verifyWebhookHmac(raw, b64, SECRET), true);
  // Re-serialised JSON is a different byte string and must not verify.
  const reserialised = Buffer.from(JSON.stringify(JSON.parse(raw.toString())));
  assert.equal(verifyWebhookHmac(reserialised, hex, SECRET), false);
  assert.equal(verifyWebhookHmac(raw, hex.replace(/^./, (c) => (c === "0" ? "1" : "0")), SECRET), false);
  assert.equal(verifyWebhookHmac(raw, null, SECRET), false);
  assert.equal(verifyWebhookHmac(raw, hex, ""), false);
  assert.equal(verifyWebhookHmac(raw, hex, "short"), false);
});

test("static authorization compares in constant time and refuses short secrets", () => {
  assert.equal(verifyStaticAuthorization("abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(verifyStaticAuthorization("abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrstuvwxyZ"), false);
  assert.equal(verifyStaticAuthorization("short", "short"), false);
  assert.equal(verifyStaticAuthorization(null, "abcdefghijklmnopqrstuvwxyz"), false);
});

function rawTransaction({ signature, failed = false, inner }) {
  const keys = [walletFromByte(1), PROGRAM_IDS.ppvCore, PROGRAM_IDS.ppvCommerce, walletFromByte(99)];
  return {
    slot: 123,
    blockTime: 1_700_000_100,
    transaction: {
      signatures: [signature],
      message: { accountKeys: keys.map((pubkey) => ({ pubkey })), instructions: [{ programIdIndex: 1, accounts: [], data: "" }] },
    },
    meta: {
      err: failed ? { InstructionError: [0, "Custom"] } : null,
      innerInstructions: inner.map(({ index, instructions }) => ({
        index,
        instructions: instructions.map(({ programIdIndex, bytes }) => ({ programIdIndex, accounts: [], data: encodeBase58(bytes) })),
      })),
    },
  };
}

test("raw transactions yield one envelope per PPV event CPI with correct coordinates", () => {
  const signature = signatureFromByte(30);
  const tx = rawTransaction({
    signature,
    inner: [
      { index: 2, instructions: [
        { programIdIndex: 2, bytes: encodePpvEvent(FIXTURES.agreementSigned) },
        { programIdIndex: 2, bytes: encodePpvEvent(FIXTURES.agreementExecuted) },
        { programIdIndex: 3, bytes: encodePpvEvent(FIXTURES.agreementExecuted) }, // foreign program: ignored
        { programIdIndex: 2, bytes: new Uint8Array([1, 2, 3]) }, // not an event: ignored
      ] },
    ],
  });
  const parsed = parseRawTransaction(tx, PROGRAM_IDS);
  assert.ok(parsed);
  assert.equal(parsed.signature, signature);
  assert.equal(parsed.failed, false);
  assert.equal(parsed.envelopes.length, 2);
  assert.deepEqual(parsed.envelopes.map((e) => [e.event.name, e.instructionIndex, e.innerInstructionIndex, e.programId]), [
    ["AgreementSigned", 2, 0, PROGRAM_IDS.ppvCommerce],
    ["AgreementExecuted", 2, 1, PROGRAM_IDS.ppvCommerce],
  ]);
  assert.equal(parsed.envelopes[0].blockTime, 1_700_000_100);
  assert.equal(parsed.malformed, 0);
});

test("a core event arriving under the commerce program is malformed, not a fact", () => {
  const tx = rawTransaction({
    signature: signatureFromByte(31),
    inner: [{ index: 0, instructions: [{ programIdIndex: 2, bytes: encodePpvEvent(FIXTURES.proofCreated) }] }],
  });
  const parsed = parseRawTransaction(tx, PROGRAM_IDS);
  assert.equal(parsed.envelopes.length, 0);
  assert.equal(parsed.malformed, 1);

  const truncated = Uint8Array.from([...EVENT_IX_TAG, ...encodePpvEvent(FIXTURES.proofCreated).subarray(8, 40)]);
  const parsedTruncated = parseRawTransaction(
    rawTransaction({ signature: signatureFromByte(32), inner: [{ index: 0, instructions: [{ programIdIndex: 1, bytes: truncated }] }] }),
    PROGRAM_IDS,
  );
  assert.equal(parsedTruncated.malformed, 1);
});

test("failed transactions never produce events", () => {
  const tx = rawTransaction({
    signature: signatureFromByte(33),
    failed: true,
    inner: [{ index: 0, instructions: [{ programIdIndex: 1, bytes: encodePpvEvent(FIXTURES.proofCreated) }] }],
  });
  const parsed = parseRawTransaction(tx, PROGRAM_IDS);
  assert.equal(parsed.failed, true);
  assert.equal(parsed.envelopes.length, 0);
});

test("webhook payloads mix raw and enhanced shapes and skip garbage", () => {
  const raw = rawTransaction({
    signature: signatureFromByte(34),
    inner: [{ index: 0, instructions: [{ programIdIndex: 1, bytes: encodePpvEvent(FIXTURES.proofCreated) }] }],
  });
  const enhanced = {
    signature: signatureFromByte(35),
    timestamp: 1_700_000_200,
    slot: 5,
    transactionError: null,
    instructions: [
      { programId: PROGRAM_IDS.ppvCore, data: "", innerInstructions: [{ programId: PROGRAM_IDS.ppvCore, data: encodeBase58(encodePpvEvent(FIXTURES.proofRevoked)) }] },
    ],
  };
  const { transactions, skipped } = parseHeliusWebhookPayload([raw, enhanced, "nope", { hello: 1 }], PROGRAM_IDS);
  assert.equal(transactions.length, 2);
  assert.equal(skipped, 2);
  assert.equal(transactions[0].envelopes[0].event.name, "ProofCreated");
  assert.equal(transactions[1].envelopes[0].event.name, "ProofRevoked");
  assert.equal(transactions[1].envelopes[0].blockTime, 1_700_000_200);
});
