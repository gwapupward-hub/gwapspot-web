import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { decodeAgreement, decodeProofRecord } from "./ppv-reputation-accounts.ts";
import { WALLET_A, WALLET_B, hexFromByte } from "./ppv-reputation-test-fixtures.mjs";

const disc = (name) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const i64 = (v) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };

test("decodes a ProofRecord account laid out as ppv_core state.rs", () => {
  const data = Buffer.concat([
    disc("ProofRecord"),
    Buffer.from([1, 254]),
    Buffer.alloc(16, 3),
    Buffer.alloc(32, 1),
    Buffer.alloc(32, 4),
    Buffer.alloc(32, 0),
    Buffer.from([4, 1]),
    i64(1_700_000_000),
    i64(1_700_000_050),
    Buffer.alloc(64, 0),
  ]);
  const proof = decodeProofRecord(Uint8Array.from(data));
  assert.equal(proof.authority, WALLET_A);
  assert.equal(proof.contentHash, hexFromByte(4, 32));
  assert.equal(proof.kind, "deliverable");
  assert.equal(proof.status, "revoked");
  assert.equal(proof.revokedAt, 1_700_000_050);
  assert.equal(decodeProofRecord(Uint8Array.from(Buffer.concat([disc("Agreement"), Buffer.alloc(200)]))), null);
});

test("decodes an Agreement account with optional signatures", () => {
  const signature = Buffer.concat([Buffer.from([1]), Buffer.alloc(32, 2), u32(1), Buffer.alloc(32, 4), Buffer.alloc(32, 5), i64(1_700_000_020)]);
  const data = Buffer.concat([
    disc("Agreement"),
    Buffer.from([1, 253]),
    Buffer.alloc(16, 7),
    Buffer.alloc(32, 1),
    Buffer.alloc(32, 2),
    u32(1),
    Buffer.alloc(32, 4),
    Buffer.alloc(32, 5),
    Buffer.from([0]),
    signature,
    Buffer.from([1]),
    i64(1_700_000_000),
    i64(1_800_000_000),
    i64(1_700_000_020),
    i64(0),
    Buffer.alloc(64, 0),
  ]);
  const agreement = decodeAgreement(Uint8Array.from(data));
  assert.equal(agreement.partyA, WALLET_A);
  assert.equal(agreement.partyB, WALLET_B);
  assert.equal(agreement.sigA, null);
  assert.equal(agreement.sigB.signer, WALLET_B);
  assert.equal(agreement.state, "executed");
  assert.equal(agreement.executedAt, 1_700_000_020);
});
