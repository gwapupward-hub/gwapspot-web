import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
/**
 * Hand-rolled Anchor encoding for the two PPV Foundation programs.
 *
 * GWAP OS already talks to Solana this way for GNS registration: raw
 * `TransactionInstruction`s built from a discriminator plus Borsh-packed
 * arguments, submitted through the existing wallet adapter. Pulling in
 * `@coral-xyz/anchor` purely to build six fixed-layout instructions would add a
 * large client bundle and a second Solana stack for no behavioural gain, so the
 * layouts are encoded directly and covered by unit tests.
 *
 * Every layout below mirrors the PPV programs at gwapupward-hub/ppv. The
 * discriminators are derived at runtime from the same
 * `sha256("global:<name>")[0..8]` rule Anchor uses, so a renamed instruction
 * fails loudly rather than silently encoding the wrong call.
 */

export const PROOF_SEED = "proof";
export const AGREEMENT_SEED = "agreement";
export const EVENT_AUTHORITY_SEED = "__event_authority";

export const PPV_ID_BYTES = 16;
export const PPV_HASH_BYTES = 32;

export type ProofKind =
  | "creation"
  | "document"
  | "agreement"
  | "invoice"
  | "deliverable"
  | "other";

// Order is the discriminant order of `ProofKind` in programs/ppv_core/src/state.rs.
const PROOF_KIND_ORDER: readonly ProofKind[] = [
  "creation",
  "document",
  "agreement",
  "invoice",
  "deliverable",
  "other",
];

export type ProofStatus = "active" | "revoked";
const PROOF_STATUS_ORDER: readonly ProofStatus[] = ["active", "revoked"];

export type AgreementState = "pending" | "executed" | "cancelled";
const AGREEMENT_STATE_ORDER: readonly AgreementState[] = [
  "pending",
  "executed",
  "cancelled",
];

export class PpvDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PpvDecodeError";
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  // The BufferSource cast keeps this valid under lib.dom's stricter
  // ArrayBufferView typing, matching how the rest of the PPV module hashes.
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as BufferSource,
  );
  return new Uint8Array(digest);
}

const discriminatorCache = new Map<string, Uint8Array>();

/** Anchor's instruction discriminator: sha256("global:<snake_case_name>")[0..8]. */
export async function instructionDiscriminator(
  name: string,
): Promise<Uint8Array> {
  const cached = discriminatorCache.get(`global:${name}`);
  if (cached) return cached;
  const digest = await sha256Bytes(new TextEncoder().encode(`global:${name}`));
  const discriminator = digest.slice(0, 8);
  discriminatorCache.set(`global:${name}`, discriminator);
  return discriminator;
}

/** Anchor's account discriminator: sha256("account:<AccountName>")[0..8]. */
export async function accountDiscriminator(
  name: string,
): Promise<Uint8Array> {
  const cached = discriminatorCache.get(`account:${name}`);
  if (cached) return cached;
  const digest = await sha256Bytes(new TextEncoder().encode(`account:${name}`));
  const discriminator = digest.slice(0, 8);
  discriminatorCache.set(`account:${name}`, discriminator);
  return discriminator;
}

export function findProofAddress(
  programId: PublicKey,
  authority: PublicKey,
  proofId: Uint8Array,
): PublicKey {
  assertLength(proofId, PPV_ID_BYTES, "proofId");
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROOF_SEED), authority.toBuffer(), Buffer.from(proofId)],
    programId,
  )[0];
}

export function findAgreementAddress(
  programId: PublicKey,
  partyA: PublicKey,
  agreementId: Uint8Array,
): PublicKey {
  assertLength(agreementId, PPV_ID_BYTES, "agreementId");
  return PublicKey.findProgramAddressSync(
    [Buffer.from(AGREEMENT_SEED), partyA.toBuffer(), Buffer.from(agreementId)],
    programId,
  )[0];
}

/** `#[event_cpi]` appends this PDA plus the program itself to every instruction. */
export function findEventAuthority(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(EVENT_AUTHORITY_SEED)],
    programId,
  )[0];
}

function assertLength(value: Uint8Array, expected: number, label: string) {
  if (value.length !== expected) {
    throw new RangeError(`${label} must be exactly ${expected} bytes`);
  }
}

function encodeI64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, value, true);
  return out;
}

function encodeU32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function concat(parts: readonly Uint8Array[]): Buffer {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return Buffer.from(out);
}

export function randomPpvId(): Uint8Array {
  const id = new Uint8Array(PPV_ID_BYTES);
  globalThis.crypto.getRandomValues(id);
  return id;
}

export function ppvIdToHex(id: Uint8Array): string {
  let out = "";
  for (const byte of id) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function ppvIdFromHex(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new RangeError("A PPV id is 32 hex characters");
  }
  const id = new Uint8Array(PPV_ID_BYTES);
  for (let index = 0; index < PPV_ID_BYTES; index += 1) {
    id[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return id;
}

// ---------------------------------------------------------------------------
// ppv_core
// ---------------------------------------------------------------------------

export async function createProofInstruction(params: {
  programId: PublicKey;
  authority: PublicKey;
  proofId: Uint8Array;
  contentHash: Uint8Array;
  contextHash: Uint8Array;
  kind: ProofKind;
}): Promise<TransactionInstruction> {
  const { programId, authority, proofId, contentHash, contextHash, kind } =
    params;
  assertLength(proofId, PPV_ID_BYTES, "proofId");
  assertLength(contentHash, PPV_HASH_BYTES, "contentHash");
  assertLength(contextHash, PPV_HASH_BYTES, "contextHash");
  if (contentHash.every((byte) => byte === 0)) {
    throw new RangeError("contentHash must not be all zeroes");
  }

  const kindIndex = PROOF_KIND_ORDER.indexOf(kind);
  if (kindIndex === -1) throw new RangeError(`Unknown proof kind: ${kind}`);

  const proof = findProofAddress(programId, authority, proofId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: proof, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: findEventAuthority(programId),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: concat([
      await instructionDiscriminator("create_proof"),
      proofId,
      contentHash,
      contextHash,
      Uint8Array.of(kindIndex),
    ]),
  });
}

export async function revokeProofInstruction(params: {
  programId: PublicKey;
  authority: PublicKey;
  proof: PublicKey;
}): Promise<TransactionInstruction> {
  const { programId, authority, proof } = params;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: proof, isSigner: false, isWritable: true },
      {
        pubkey: findEventAuthority(programId),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: concat([await instructionDiscriminator("revoke_proof")]),
  });
}

export type ProofRecord = {
  schemaVersion: number;
  bump: number;
  proofId: Uint8Array;
  authority: PublicKey;
  contentHash: Uint8Array;
  contextHash: Uint8Array;
  kind: ProofKind;
  status: ProofStatus;
  createdAt: bigint;
  revokedAt: bigint;
};

export async function decodeProofRecord(
  data: Uint8Array,
): Promise<ProofRecord> {
  const reader = new AccountReader(data);
  await reader.expectDiscriminator("ProofRecord");

  const schemaVersion = reader.u8();
  const bump = reader.u8();
  const proofId = reader.bytes(PPV_ID_BYTES);
  const authority = reader.pubkey();
  const contentHash = reader.bytes(PPV_HASH_BYTES);
  const contextHash = reader.bytes(PPV_HASH_BYTES);
  const kind = reader.enumValue(PROOF_KIND_ORDER, "ProofKind");
  const status = reader.enumValue(PROOF_STATUS_ORDER, "ProofStatus");
  const createdAt = reader.i64();
  const revokedAt = reader.i64();

  return {
    schemaVersion,
    bump,
    proofId,
    authority,
    contentHash,
    contextHash,
    kind,
    status,
    createdAt,
    revokedAt,
  };
}

// ---------------------------------------------------------------------------
// ppv_commerce
// ---------------------------------------------------------------------------

export async function createAgreementInstruction(params: {
  programId: PublicKey;
  partyA: PublicKey;
  partyB: PublicKey;
  agreementId: Uint8Array;
  contentHash: Uint8Array;
  termsHash: Uint8Array;
  expiresAt: bigint;
}): Promise<TransactionInstruction> {
  const {
    programId,
    partyA,
    partyB,
    agreementId,
    contentHash,
    termsHash,
    expiresAt,
  } = params;
  assertLength(agreementId, PPV_ID_BYTES, "agreementId");
  assertLength(contentHash, PPV_HASH_BYTES, "contentHash");
  assertLength(termsHash, PPV_HASH_BYTES, "termsHash");
  if (partyB.equals(partyA)) {
    throw new RangeError("The counterparty must be a different wallet");
  }

  const agreement = findAgreementAddress(programId, partyA, agreementId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: partyA, isSigner: true, isWritable: true },
      { pubkey: agreement, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: findEventAuthority(programId),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: concat([
      await instructionDiscriminator("create_agreement"),
      agreementId,
      partyB.toBytes(),
      contentHash,
      termsHash,
      encodeI64(expiresAt),
    ]),
  });
}

function mutateAgreementKeys(programId: PublicKey, signer: PublicKey, agreement: PublicKey) {
  return [
    { pubkey: signer, isSigner: true, isWritable: false },
    { pubkey: agreement, isSigner: false, isWritable: true },
    {
      pubkey: findEventAuthority(programId),
      isSigner: false,
      isWritable: false,
    },
    { pubkey: programId, isSigner: false, isWritable: false },
  ];
}

export async function proposeRevisionInstruction(params: {
  programId: PublicKey;
  signer: PublicKey;
  agreement: PublicKey;
  expectedVersion: number;
  newContentHash: Uint8Array;
  newTermsHash: Uint8Array;
}): Promise<TransactionInstruction> {
  const {
    programId,
    signer,
    agreement,
    expectedVersion,
    newContentHash,
    newTermsHash,
  } = params;
  assertLength(newContentHash, PPV_HASH_BYTES, "newContentHash");
  assertLength(newTermsHash, PPV_HASH_BYTES, "newTermsHash");

  return new TransactionInstruction({
    programId,
    keys: mutateAgreementKeys(programId, signer, agreement),
    data: concat([
      await instructionDiscriminator("propose_revision"),
      encodeU32(expectedVersion),
      newContentHash,
      newTermsHash,
    ]),
  });
}

export async function signAgreementInstruction(params: {
  programId: PublicKey;
  signer: PublicKey;
  agreement: PublicKey;
  expectedVersion: number;
  expectedContentHash: Uint8Array;
  expectedTermsHash: Uint8Array;
}): Promise<TransactionInstruction> {
  const {
    programId,
    signer,
    agreement,
    expectedVersion,
    expectedContentHash,
    expectedTermsHash,
  } = params;
  assertLength(expectedContentHash, PPV_HASH_BYTES, "expectedContentHash");
  assertLength(expectedTermsHash, PPV_HASH_BYTES, "expectedTermsHash");

  return new TransactionInstruction({
    programId,
    keys: mutateAgreementKeys(programId, signer, agreement),
    data: concat([
      await instructionDiscriminator("sign_agreement"),
      encodeU32(expectedVersion),
      expectedContentHash,
      expectedTermsHash,
    ]),
  });
}

export async function cancelAgreementInstruction(params: {
  programId: PublicKey;
  signer: PublicKey;
  agreement: PublicKey;
}): Promise<TransactionInstruction> {
  const { programId, signer, agreement } = params;
  return new TransactionInstruction({
    programId,
    keys: mutateAgreementKeys(programId, signer, agreement),
    data: concat([await instructionDiscriminator("cancel_agreement")]),
  });
}

export type SignatureRecord = {
  signer: PublicKey;
  versionSigned: number;
  contentHashSigned: Uint8Array;
  termsHashSigned: Uint8Array;
  signedAt: bigint;
};

export type AgreementRecord = {
  schemaVersion: number;
  bump: number;
  agreementId: Uint8Array;
  partyA: PublicKey;
  partyB: PublicKey;
  version: number;
  contentHash: Uint8Array;
  termsHash: Uint8Array;
  sigA: SignatureRecord | null;
  sigB: SignatureRecord | null;
  state: AgreementState;
  createdAt: bigint;
  expiresAt: bigint;
  executedAt: bigint;
  cancelledAt: bigint;
};

export async function decodeAgreementRecord(
  data: Uint8Array,
): Promise<AgreementRecord> {
  const reader = new AccountReader(data);
  await reader.expectDiscriminator("Agreement");

  const schemaVersion = reader.u8();
  const bump = reader.u8();
  const agreementId = reader.bytes(PPV_ID_BYTES);
  const partyA = reader.pubkey();
  const partyB = reader.pubkey();
  const version = reader.u32();
  const contentHash = reader.bytes(PPV_HASH_BYTES);
  const termsHash = reader.bytes(PPV_HASH_BYTES);
  const sigA = reader.optionalSignature();
  const sigB = reader.optionalSignature();
  const state = reader.enumValue(AGREEMENT_STATE_ORDER, "AgreementState");
  const createdAt = reader.i64();
  const expiresAt = reader.i64();
  const executedAt = reader.i64();
  const cancelledAt = reader.i64();

  return {
    schemaVersion,
    bump,
    agreementId,
    partyA,
    partyB,
    version,
    contentHash,
    termsHash,
    sigA,
    sigB,
    state,
    createdAt,
    expiresAt,
    executedAt,
    cancelledAt,
  };
}

class AccountReader {
  private readonly data: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  async expectDiscriminator(accountName: string) {
    const expected = await accountDiscriminator(accountName);
    const actual = this.bytes(8);
    for (let index = 0; index < 8; index += 1) {
      if (actual[index] !== expected[index]) {
        throw new PpvDecodeError(
          `Account is not a PPV ${accountName}. It may belong to a different program deployment.`,
        );
      }
    }
  }

  private take(length: number): number {
    const start = this.offset;
    if (start + length > this.data.length) {
      throw new PpvDecodeError("Account data ended earlier than the schema expects");
    }
    this.offset += length;
    return start;
  }

  bytes(length: number): Uint8Array {
    return this.data.slice(this.take(length), this.offset);
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  i64(): bigint {
    return this.view.getBigInt64(this.take(8), true);
  }

  pubkey(): PublicKey {
    return new PublicKey(this.bytes(32));
  }

  enumValue<T extends string>(order: readonly T[], label: string): T {
    const index = this.u8();
    const value = order[index];
    if (value === undefined) {
      throw new PpvDecodeError(`Unknown ${label} discriminant ${index}`);
    }
    return value;
  }

  optionalSignature(): SignatureRecord | null {
    // Borsh encodes Option<T> as a single presence byte followed by T.
    const present = this.u8();
    if (present === 0) return null;
    if (present !== 1) {
      throw new PpvDecodeError(`Invalid Option tag ${present}`);
    }
    return {
      signer: this.pubkey(),
      versionSigned: this.u32(),
      contentHashSigned: this.bytes(PPV_HASH_BYTES),
      termsHashSigned: this.bytes(PPV_HASH_BYTES),
      signedAt: this.i64(),
    };
  }
}

// ---------------------------------------------------------------------------
// Error surfacing
// ---------------------------------------------------------------------------

// Anchor numbers custom errors from 6000 in declaration order. These mirror
// programs/ppv_core/src/errors.rs and programs/ppv_commerce/src/errors.rs.
const CORE_ERRORS: Readonly<Record<number, string>> = {
  6000: "The content hash was empty. Nothing was written on chain.",
  6001: "That wallet is not this proof's authority.",
  6002: "This proof is already revoked. Revocation is final.",
};

const COMMERCE_ERRORS: Readonly<Record<number, string>> = {
  6000: "That wallet is not a party to this agreement.",
  6001: "The counterparty must be a different, non-empty wallet.",
  6002: "The agreement is no longer pending, so it cannot be changed.",
  6003: "This agreement has expired.",
  6004: "That wallet has already signed the current version.",
  6005: "The agreement moved on. You were signing an older version — reload and review the current one.",
  6006: "The content hash does not match the agreement's current content.",
  6007: "The terms hash does not match the agreement's current terms.",
  6008: "The content hash was empty.",
  6009: "The terms hash was empty.",
  6010: "A revision has to change the content or the terms.",
  6011: "The expiry must be in the future and within one year.",
  6012: "Arithmetic overflow.",
};

/**
 * Turn a program error into something a person can act on. Returns null when the
 * failure is not a recognised PPV program error, so the caller surfaces the raw
 * reason instead of inventing one.
 */
export function describePpvProgramError(
  error: unknown,
  program: "core" | "commerce",
): string | null {
  const code = extractAnchorErrorCode(error);
  if (code === null) return null;
  const table = program === "core" ? CORE_ERRORS : COMMERCE_ERRORS;
  return table[code] ?? null;
}

function extractAnchorErrorCode(error: unknown): number | null {
  const logs = readLogs(error);
  for (const line of logs) {
    const match = /custom program error: 0x([0-9a-f]+)/i.exec(line);
    if (match) return Number.parseInt(match[1], 16);
    const decimal = /Error Number: (\d+)/.exec(line);
    if (decimal) return Number.parseInt(decimal[1], 10);
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = /custom program error: 0x([0-9a-f]+)/i.exec(message);
  return match ? Number.parseInt(match[1], 16) : null;
}

function readLogs(error: unknown): readonly string[] {
  if (typeof error !== "object" || error === null) return [];
  const logs = (error as { logs?: unknown }).logs;
  return Array.isArray(logs) ? logs.filter((line): line is string => typeof line === "string") : [];
}
