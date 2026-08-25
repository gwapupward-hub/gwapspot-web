/**
 * Pure decoding for PPV account state: layouts, discriminators, PDA derivations
 * and input parsers, with no RPC and no `server-only`.
 *
 * Split out of `chain.ts` so the decoders can be exercised directly from a test
 * process. `chain.ts` imports `server-only`, which throws outside a React server
 * context, and that made the layouts — the part most likely to drift from the
 * program — the part hardest to test against a real account.
 *
 * The layouts mirror `ProofRecord` and `Agreement` in gwapupward-hub/ppv.
 * Offsets are Anchor's 8-byte account discriminator followed by the struct
 * fields in declaration order.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

const PROOF_DISCRIMINATOR = accountDiscriminator("ProofRecord");
const AGREEMENT_DISCRIMINATOR = accountDiscriminator("Agreement");

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}


export function parseProofId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw new Error("Invalid proof id");
  return Buffer.from(normalized, "hex");
}

export function parseContentHash(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error("Invalid content hash");
  return normalized;
}

export function parseWallet(value: string) {
  const normalized = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalized)) {
    throw new Error("Invalid wallet address");
  }
  return new PublicKey(normalized);
}

/**
 * Proof PDAs are seeded with the authority as well as the id, so a proof id on
 * its own does not name an account. Every lookup needs the owning wallet.
 */
export function deriveServerProofPda(
  owner: PublicKey,
  proofId: Buffer,
  programId: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("proof"), owner.toBuffer(), proofId],
    programId,
  )[0];
}

export function deriveServerAgreementPda(
  partyA: PublicKey,
  agreementId: Buffer,
  programId: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agreement"), partyA.toBuffer(), agreementId],
    programId,
  )[0];
}


const PROOF_KINDS = [
  "creation",
  "document",
  "agreement",
  "invoice",
  "deliverable",
  "other",
] as const;

const AGREEMENT_STATES = ["pending", "executed", "cancelled"] as const;

export type OnChainProof = {
  proofId: string;
  proofPda: string;
  authority: string;
  contentHash: string;
  contextHash: string | null;
  kind: (typeof PROOF_KINDS)[number];
  createdAt: number;
  revoked: boolean;
  /** Null when the proof is active. Never zero — zero is "no such event". */
  revokedAt: number | null;
};

// 8 discriminator + 1 schema_version + 1 bump + 16 id + 32 authority
// + 32 content + 32 context + 1 kind + 1 status + 8 created + 8 revoked + 64 reserved
const PROOF_ACCOUNT_BYTES = 204;

export function decodeProofAccount(data: Buffer, proofPda: PublicKey): OnChainProof {
  if (
    data.length < PROOF_ACCOUNT_BYTES ||
    !data.subarray(0, 8).equals(PROOF_DISCRIMINATOR)
  ) {
    throw new Error("Account is not a PPV ProofRecord");
  }
  if (data[8] !== 1) throw new Error("Unsupported PPV proof schema");

  const kind = PROOF_KINDS[data[122]];
  if (!kind) throw new Error("Unknown PPV proof kind");
  const revoked = data[123] === 1;
  const contextHash = data.subarray(90, 122).toString("hex");

  return {
    proofId: data.subarray(10, 26).toString("hex"),
    proofPda: proofPda.toBase58(),
    authority: new PublicKey(data.subarray(26, 58)).toBase58(),
    contentHash: data.subarray(58, 90).toString("hex"),
    // The program writes all zeroes to mean "absent". Surfacing that as a hash
    // would present a missing commitment as a real one.
    contextHash: /^0+$/.test(contextHash) ? null : contextHash,
    kind,
    createdAt: Number(data.readBigInt64LE(124)),
    revoked,
    revokedAt: revoked ? Number(data.readBigInt64LE(132)) : null,
  };
}


export type OnChainSignature = {
  signer: string;
  versionSigned: number;
  contentHashSigned: string;
  termsHashSigned: string;
  signedAt: number;
};

export type OnChainAgreement = {
  agreementId: string;
  agreementPda: string;
  partyA: string;
  partyB: string;
  version: number;
  contentHash: string;
  termsHash: string;
  signatureA: OnChainSignature | null;
  signatureB: OnChainSignature | null;
  state: (typeof AGREEMENT_STATES)[number];
  createdAt: number;
  expiresAt: number;
  executedAt: number | null;
  cancelledAt: number | null;
};

class AgreementCursor {
  private offset = 0;
  private readonly data: Buffer;

  // Written as an explicit field rather than a constructor parameter property:
  // parameter properties need a TypeScript transform, and this module has to
  // load under Node's strip-only type handling so the harness can import it.
  constructor(data: Buffer) {
    this.data = data;
  }

  skip(length: number) {
    this.offset += length;
  }

  private take(length: number) {
    const start = this.offset;
    if (start + length > this.data.length) {
      throw new Error("PPV Agreement account is shorter than the schema");
    }
    this.offset += length;
    return start;
  }

  u8() {
    return this.data[this.take(1)];
  }

  u32() {
    return this.data.readUInt32LE(this.take(4));
  }

  i64() {
    return Number(this.data.readBigInt64LE(this.take(8)));
  }

  hex(length: number) {
    const start = this.take(length);
    return this.data.subarray(start, start + length).toString("hex");
  }

  pubkey() {
    const start = this.take(32);
    return new PublicKey(this.data.subarray(start, start + 32)).toBase58();
  }

  optionalSignature(): OnChainSignature | null {
    const present = this.u8();
    if (present === 0) return null;
    if (present !== 1) throw new Error("Invalid Option tag in PPV Agreement");
    return {
      signer: this.pubkey(),
      versionSigned: this.u32(),
      contentHashSigned: this.hex(32),
      termsHashSigned: this.hex(32),
      signedAt: this.i64(),
    };
  }
}

export function decodeAgreementAccount(
  data: Buffer,
  agreementPda: PublicKey,
): OnChainAgreement {
  if (!data.subarray(0, 8).equals(AGREEMENT_DISCRIMINATOR)) {
    throw new Error("Account is not a PPV Agreement");
  }

  const cursor = new AgreementCursor(data);
  cursor.skip(8);
  if (cursor.u8() !== 1) throw new Error("Unsupported PPV agreement schema");
  cursor.skip(1); // bump

  const agreementId = cursor.hex(16);
  const partyA = cursor.pubkey();
  const partyB = cursor.pubkey();
  const version = cursor.u32();
  const contentHash = cursor.hex(32);
  const termsHash = cursor.hex(32);
  const signatureA = cursor.optionalSignature();
  const signatureB = cursor.optionalSignature();

  const stateIndex = cursor.u8();
  const state = AGREEMENT_STATES[stateIndex];
  if (!state) throw new Error("Unknown PPV agreement state");

  const createdAt = cursor.i64();
  const expiresAt = cursor.i64();
  const executedAt = cursor.i64();
  const cancelledAt = cursor.i64();

  return {
    agreementId,
    agreementPda: agreementPda.toBase58(),
    partyA,
    partyB,
    version,
    contentHash,
    termsHash,
    signatureA,
    signatureB,
    state,
    createdAt,
    expiresAt,
    // The program leaves these at zero until the transition happens. Zero is
    // not a timestamp, so it is reported as absent rather than as 1970.
    executedAt: state === "executed" ? executedAt : null,
    cancelledAt: state === "cancelled" ? cancelledAt : null,
  };
}

export function safeProofActor(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
