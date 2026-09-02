// Shared fixtures for PPV reputation tests. Mirrors sdk/test/helpers/ppv-events.ts in gwapupward-hub/ppv.
import { createHash } from "node:crypto";
import { EVENT_IX_TAG, encodeBase58 } from "./ppv-reputation/index.ts";

const KIND = { creation: 0, document: 1, agreement: 2, invoice: 3, deliverable: 4, other: 5 };

export function walletFromByte(byte) {
  return encodeBase58(new Uint8Array(32).fill(byte));
}
export function signatureFromByte(byte) {
  return encodeBase58(new Uint8Array(64).fill(byte));
}
export function hexFromByte(byte, length) {
  return Buffer.alloc(length, byte).toString("hex");
}
const fills = new Map();
for (let b = 0; b < 256; b += 1) fills.set(walletFromByte(b), b);
const pubkey = (value) => Buffer.alloc(32, fills.get(value));
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const i64 = (v) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b; };
const hex = (h) => Buffer.from(h, "hex");
const disc = (name) => createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);

export function encodePpvEvent(e) {
  let body;
  switch (e.name) {
    case "ProofCreated": body = Buffer.concat([pubkey(e.proof), pubkey(e.authority), hex(e.proofId), hex(e.contentHash), hex(e.contextHash), Buffer.from([KIND[e.kind]]), i64(e.createdAt)]); break;
    case "ProofRevoked": body = Buffer.concat([pubkey(e.proof), pubkey(e.authority), hex(e.proofId), hex(e.contentHash), Buffer.from([KIND[e.kind]]), i64(e.revokedAt)]); break;
    case "AgreementCreated": body = Buffer.concat([pubkey(e.agreement), hex(e.agreementId), pubkey(e.partyA), pubkey(e.partyB), u32(e.version), hex(e.contentHash), hex(e.termsHash), i64(e.expiresAt), i64(e.createdAt)]); break;
    case "AgreementRevised": body = Buffer.concat([pubkey(e.agreement), pubkey(e.partyA), pubkey(e.partyB), pubkey(e.proposer), u32(e.previousVersion), u32(e.newVersion), hex(e.contentHash), hex(e.termsHash), Buffer.from([e.signaturesCleared ? 1 : 0]), i64(e.revisedAt)]); break;
    case "AgreementSigned": body = Buffer.concat([pubkey(e.agreement), pubkey(e.partyA), pubkey(e.partyB), pubkey(e.signer), u32(e.version), hex(e.contentHash), hex(e.termsHash), i64(e.signedAt)]); break;
    case "AgreementExecuted": body = Buffer.concat([pubkey(e.agreement), pubkey(e.partyA), pubkey(e.partyB), u32(e.version), hex(e.contentHash), hex(e.termsHash), i64(e.executedAt)]); break;
    case "AgreementCancelled": body = Buffer.concat([pubkey(e.agreement), pubkey(e.partyA), pubkey(e.partyB), pubkey(e.cancelledBy), u32(e.version), i64(e.cancelledAt)]); break;
    default: throw new Error(`unknown event ${e.name}`);
  }
  return Uint8Array.from(Buffer.concat([Buffer.from(EVENT_IX_TAG), disc(e.name), body]));
}

export const WALLET_A = walletFromByte(1);
export const WALLET_B = walletFromByte(2);
export const WALLET_C = walletFromByte(3);
export const PROOF_PDA = walletFromByte(10);
export const AGREEMENT_PDA = walletFromByte(11);
export const PROGRAM_IDS = { ppvCore: walletFromByte(200), ppvCommerce: walletFromByte(201) };

export const FIXTURES = {
  proofCreated: { name: "ProofCreated", proof: PROOF_PDA, authority: WALLET_A, proofId: hexFromByte(3, 16), contentHash: hexFromByte(4, 32), contextHash: hexFromByte(5, 32), kind: "deliverable", createdAt: 1_700_000_000 },
  proofRevoked: { name: "ProofRevoked", proof: PROOF_PDA, authority: WALLET_A, proofId: hexFromByte(3, 16), contentHash: hexFromByte(4, 32), kind: "deliverable", revokedAt: 1_700_000_001 },
  agreementCreated: { name: "AgreementCreated", agreement: AGREEMENT_PDA, agreementId: hexFromByte(7, 16), partyA: WALLET_A, partyB: WALLET_B, version: 1, contentHash: hexFromByte(4, 32), termsHash: hexFromByte(5, 32), expiresAt: 1_800_000_000, createdAt: 1_700_000_000 },
  agreementSigned: { name: "AgreementSigned", agreement: AGREEMENT_PDA, partyA: WALLET_A, partyB: WALLET_B, signer: WALLET_B, version: 1, contentHash: hexFromByte(4, 32), termsHash: hexFromByte(5, 32), signedAt: 1_700_000_020 },
  agreementExecuted: { name: "AgreementExecuted", agreement: AGREEMENT_PDA, partyA: WALLET_A, partyB: WALLET_B, version: 1, contentHash: hexFromByte(4, 32), termsHash: hexFromByte(5, 32), executedAt: 1_700_000_020 },
  agreementCancelled: { name: "AgreementCancelled", agreement: AGREEMENT_PDA, partyA: WALLET_A, partyB: WALLET_B, cancelledBy: WALLET_A, version: 1, cancelledAt: 1_700_000_030 },
};

export function snapshot(name, owner, resolvedAt = "2026-01-01T00:00:00.000Z") {
  return { schemaVersion: 1, name, fullName: `${name}.gwap`, owner, resolvedAt };
}

/** In-memory stand-in for the workspace Redis client. */
export class MemoryStorage {
  constructor() { this.map = new Map(); this.writes = 0; }
  key(scope, subject) { return `${scope}:${subject}`; }
  async get(key) { const v = this.map.get(key); return v === undefined ? null : JSON.parse(v); }
  async set(key, value) { this.writes += 1; this.map.set(key, JSON.stringify(value)); }
  async setIfAbsentValue(key, value) { if (this.map.has(key)) return false; this.writes += 1; this.map.set(key, JSON.stringify(value)); return true; }
  async setIfAbsent(key, value) { if (this.map.has(key)) return false; this.map.set(key, JSON.stringify(value)); return true; }
  async deleteIfValue(key, value) { if (this.map.get(key) === JSON.stringify(value)) { this.map.delete(key); return true; } return false; }
}
