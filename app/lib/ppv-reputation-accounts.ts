import { createHash } from "node:crypto";
import { encodeBase58 } from "./ppv-reputation/base58.ts";
import { PROOF_KINDS, type ProofKind } from "./ppv-reputation/chain-events.ts";

/**
 * Decoders for the PPV account layouts. Offsets follow the field order in
 * `programs/ppv_core/src/state.rs` and `programs/ppv_commerce/src/state.rs`
 * after Anchor's 8-byte account discriminator. Chain state read through these
 * is the truth every projection is reconciled against.
 */

function discriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

export const PROOF_RECORD_DISCRIMINATOR = discriminator("ProofRecord");
export const AGREEMENT_DISCRIMINATOR = discriminator("Agreement");

export type ProofRecordState = {
  schemaVersion: number;
  proofId: string;
  authority: string;
  contentHash: string;
  contextHash: string;
  kind: ProofKind;
  status: "active" | "revoked";
  createdAt: number;
  revokedAt: number;
};

export type AgreementSignature = {
  signer: string;
  versionSigned: number;
  contentHashSigned: string;
  termsHashSigned: string;
  signedAt: number;
};

export type AgreementState = {
  schemaVersion: number;
  agreementId: string;
  partyA: string;
  partyB: string;
  version: number;
  contentHash: string;
  termsHash: string;
  sigA: AgreementSignature | null;
  sigB: AgreementSignature | null;
  state: "pending" | "executed" | "cancelled";
  createdAt: number;
  expiresAt: number;
  executedAt: number;
  cancelledAt: number;
};

class Reader {
  offset = 0;
  private readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  take(length: number) {
    if (this.offset + length > this.bytes.length) throw new RangeError("account data truncated");
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }
  u8() {
    return this.take(1)[0] as number;
  }
  u32() {
    const s = this.take(4);
    return new DataView(s.buffer, s.byteOffset, 4).getUint32(0, true);
  }
  i64() {
    const s = this.take(8);
    return Number(new DataView(s.buffer, s.byteOffset, 8).getBigInt64(0, true));
  }
  hex(length: number) {
    return Buffer.from(this.take(length)).toString("hex");
  }
  pubkey() {
    return encodeBase58(this.take(32));
  }
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array) {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (bytes[i] !== prefix[i]) return false;
  return true;
}

export function decodeProofRecord(data: Uint8Array): ProofRecordState | null {
  if (!startsWith(data, PROOF_RECORD_DISCRIMINATOR)) return null;
  const reader = new Reader(data.subarray(8));
  const schemaVersion = reader.u8();
  reader.u8(); // bump
  const proofId = reader.hex(16);
  const authority = reader.pubkey();
  const contentHash = reader.hex(32);
  const contextHash = reader.hex(32);
  const kindIndex = reader.u8();
  const kind = PROOF_KINDS[kindIndex];
  if (!kind) throw new RangeError("unknown proof kind");
  const statusIndex = reader.u8();
  if (statusIndex > 1) throw new RangeError("unknown proof status");
  const createdAt = reader.i64();
  const revokedAt = reader.i64();
  return {
    schemaVersion,
    proofId,
    authority,
    contentHash,
    contextHash,
    kind,
    status: statusIndex === 0 ? "active" : "revoked",
    createdAt,
    revokedAt,
  };
}

function optionalSignature(reader: Reader): AgreementSignature | null {
  const tag = reader.u8();
  if (tag === 0) return null;
  if (tag !== 1) throw new RangeError("invalid option tag");
  return {
    signer: reader.pubkey(),
    versionSigned: reader.u32(),
    contentHashSigned: reader.hex(32),
    termsHashSigned: reader.hex(32),
    signedAt: reader.i64(),
  };
}

export function decodeAgreement(data: Uint8Array): AgreementState | null {
  if (!startsWith(data, AGREEMENT_DISCRIMINATOR)) return null;
  const reader = new Reader(data.subarray(8));
  const schemaVersion = reader.u8();
  reader.u8(); // bump
  const agreementId = reader.hex(16);
  const partyA = reader.pubkey();
  const partyB = reader.pubkey();
  const version = reader.u32();
  const contentHash = reader.hex(32);
  const termsHash = reader.hex(32);
  const sigA = optionalSignature(reader);
  const sigB = optionalSignature(reader);
  const stateIndex = reader.u8();
  const state = (["pending", "executed", "cancelled"] as const)[stateIndex];
  if (!state) throw new RangeError("unknown agreement state");
  return {
    schemaVersion,
    agreementId,
    partyA,
    partyB,
    version,
    contentHash,
    termsHash,
    sigA,
    sigB,
    state,
    createdAt: reader.i64(),
    expiresAt: reader.i64(),
    executedAt: reader.i64(),
    cancelledAt: reader.i64(),
  };
}
