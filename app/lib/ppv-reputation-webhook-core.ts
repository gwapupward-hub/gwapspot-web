import { createHmac, timingSafeEqual } from "node:crypto";
import { decodeBase58 } from "./ppv-reputation/base58.ts";
import { decodePpvEventData, programForEvent } from "./ppv-reputation/chain-events.ts";
import type { ChainEventEnvelope } from "./ppv-reputation/normalize.ts";

/**
 * Pure helpers for the PPV Helius webhook and for reconciliation. Nothing here
 * touches storage or the network, so the whole parse path is unit-tested with
 * recorded payload shapes.
 */

export type PpvProgramIds = { ppvCore: string; ppvCommerce: string };

/**
 * Verifies an HMAC-SHA256 signature over the raw request body bytes. The
 * body must be the exact bytes received: re-serialising parsed JSON changes
 * whitespace and key order and would break the comparison. Accepts hex or
 * base64url digests; both are compared in constant time.
 */
export function verifyWebhookHmac(rawBody: Uint8Array, signatureHeader: string | null, secret: string): boolean {
  if (!secret || secret.length < 16 || !signatureHeader) return false;
  const provided = signatureHeader.trim().replace(/^sha256=/i, "");
  if (!provided) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest();

  if (/^[a-f0-9]{64}$/i.test(provided)) {
    return timingSafeEqual(Buffer.from(provided, "hex"), digest);
  }
  const b64 = Buffer.from(provided, "base64url");
  return b64.length === digest.length && timingSafeEqual(b64, digest);
}

/** Constant-time comparison for a static bearer/authorization header. */
export function verifyStaticAuthorization(header: string | null, expected: string): boolean {
  if (!expected || expected.length < 16 || !header) return false;
  const left = Buffer.from(header.trim());
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function accountKey(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  const record = asRecord(entry);
  return asString(record?.pubkey);
}

function decodeInstructionData(data: unknown): Uint8Array | null {
  const text = asString(data);
  if (!text) return null;
  try {
    return decodeBase58(text);
  } catch {
    return null;
  }
}

export type ParsedTransaction = {
  signature: string;
  slot: number | null;
  blockTime: number | null;
  failed: boolean;
  envelopes: ChainEventEnvelope[];
  /** Instruction data that claimed to be a PPV event but could not be decoded. */
  malformed: number;
};

/**
 * Parses one transaction in the Solana JSON-RPC `getTransaction` shape (which
 * is also what Helius "raw" webhooks deliver). Only inner instructions that
 * target a configured PPV program and carry a valid event CPI produce
 * envelopes; every other instruction is ignored, never guessed at.
 */
export function parseRawTransaction(value: unknown, programIds: PpvProgramIds): ParsedTransaction | null {
  const root = asRecord(value);
  if (!root) return null;
  const transaction = asRecord(root.transaction);
  const message = asRecord(transaction?.message);
  const signatures = Array.isArray(transaction?.signatures) ? transaction.signatures : [];
  const signature = asString(signatures[0]) ?? asString(root.signature);
  if (!message || !signature) return null;

  const meta = asRecord(root.meta);
  const failed = meta !== null && meta.err !== null && meta.err !== undefined;
  const staticKeys = Array.isArray(message.accountKeys) ? message.accountKeys.map(accountKey) : [];
  const loaded = asRecord(meta?.loadedAddresses);
  const writable = Array.isArray(loaded?.writable) ? loaded.writable.map(accountKey) : [];
  const readonly = Array.isArray(loaded?.readonly) ? loaded.readonly.map(accountKey) : [];
  const keys = [...staticKeys, ...writable, ...readonly];
  const blockTime = asNumber(root.blockTime);
  const slot = asNumber(root.slot);

  const envelopes: ChainEventEnvelope[] = [];
  let malformed = 0;
  if (!failed) {
    const inner = Array.isArray(meta?.innerInstructions) ? meta.innerInstructions : [];
    for (const group of inner) {
      const groupRecord = asRecord(group);
      const instructionIndex = asNumber(groupRecord?.index);
      const instructions = Array.isArray(groupRecord?.instructions) ? groupRecord.instructions : [];
      if (instructionIndex === null) continue;
      instructions.forEach((instruction, innerInstructionIndex) => {
        const record = asRecord(instruction);
        const programIndex = asNumber(record?.programIdIndex);
        const programId =
          programIndex !== null ? keys[programIndex] ?? null : asString(record?.programId);
        if (!programId || (programId !== programIds.ppvCore && programId !== programIds.ppvCommerce)) return;
        const data = decodeInstructionData(record?.data);
        if (!data) return;
        pushEnvelope(envelopes, data, {
          programId,
          signature,
          instructionIndex,
          innerInstructionIndex,
          blockTime,
          onMalformed: () => {
            malformed += 1;
          },
          programIds,
        });
      });
    }
  }

  return { signature, slot, blockTime, failed, envelopes, malformed };
}

/**
 * Parses one Helius "enhanced" transaction. Enhanced payloads flatten inner
 * instructions under each top-level instruction and carry base58 data.
 */
export function parseEnhancedTransaction(value: unknown, programIds: PpvProgramIds): ParsedTransaction | null {
  const root = asRecord(value);
  const signature = asString(root?.signature);
  if (!root || !signature) return null;
  const failed = root.transactionError !== null && root.transactionError !== undefined;
  const blockTime = asNumber(root.timestamp);
  const slot = asNumber(root.slot);
  const envelopes: ChainEventEnvelope[] = [];
  let malformed = 0;

  if (!failed) {
    const instructions = Array.isArray(root.instructions) ? root.instructions : [];
    instructions.forEach((instruction, instructionIndex) => {
      const record = asRecord(instruction);
      const inner = Array.isArray(record?.innerInstructions) ? record.innerInstructions : [];
      inner.forEach((innerInstruction, innerInstructionIndex) => {
        const innerRecord = asRecord(innerInstruction);
        const programId = asString(innerRecord?.programId);
        if (!programId || (programId !== programIds.ppvCore && programId !== programIds.ppvCommerce)) return;
        const data = decodeInstructionData(innerRecord?.data);
        if (!data) return;
        pushEnvelope(envelopes, data, {
          programId,
          signature,
          instructionIndex,
          innerInstructionIndex,
          blockTime,
          onMalformed: () => {
            malformed += 1;
          },
          programIds,
        });
      });
    });
  }

  return { signature, slot, blockTime, failed, envelopes, malformed };
}

function pushEnvelope(
  envelopes: ChainEventEnvelope[],
  data: Uint8Array,
  context: {
    programId: string;
    signature: string;
    instructionIndex: number;
    innerInstructionIndex: number;
    blockTime: number | null;
    onMalformed: () => void;
    programIds: PpvProgramIds;
  },
) {
  let event;
  try {
    event = decodePpvEventData(data);
  } catch {
    context.onMalformed();
    return;
  }
  if (!event) return;
  const owner = programForEvent(event.name);
  const expected = owner === "ppv_core" ? context.programIds.ppvCore : context.programIds.ppvCommerce;
  if (context.programId !== expected) {
    // A foreign program replaying PPV-shaped bytes is not a PPV fact.
    context.onMalformed();
    return;
  }
  envelopes.push({
    event,
    programId: context.programId,
    transactionSignature: context.signature,
    instructionIndex: context.instructionIndex,
    innerInstructionIndex: context.innerInstructionIndex,
    blockTime: context.blockTime,
  });
}

/**
 * A Helius webhook body is an array of transactions, in either raw or
 * enhanced shape. Unknown entries are skipped so one malformed item cannot
 * hold the rest of the batch hostage; the caller reports the skip count.
 */
export function parseHeliusWebhookPayload(payload: unknown, programIds: PpvProgramIds) {
  const items = Array.isArray(payload) ? payload : [payload];
  const transactions: ParsedTransaction[] = [];
  let skipped = 0;
  for (const item of items) {
    const record = asRecord(item);
    const parsed = record?.transaction
      ? parseRawTransaction(item, programIds)
      : parseEnhancedTransaction(item, programIds);
    if (parsed) transactions.push(parsed);
    else skipped += 1;
  }
  return { transactions, skipped };
}

export const MAX_WEBHOOK_BODY_BYTES = 4 * 1024 * 1024;
