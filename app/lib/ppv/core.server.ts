import "server-only";

import { Buffer } from "buffer";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildCreateProofInstruction,
  buildRevokeProofInstruction,
  deriveCoreProofRecord,
  type InstructionSpec,
} from "../ppv-sdk/instructions";
import {
  PPV_CORE_PROOF_ACCOUNT_BYTES,
  bytesToLowerHex,
  fixedHexToBytes,
  isPpvCoreProofKind,
  type PpvCoreProofKind,
} from "./core";
import { getPpvObservationConfig } from "./config.server";
import { PPV_PROGRAM_IDS, PpvPolicyError } from "./policy";
import { requirePpvMutationReadiness } from "./readiness.server";

const PROOF_MIN_BYTES = 132;
const PROOF_SCHEMA_OFFSET = 8;
const PROOF_ID_OFFSET = 10;
const PROOF_AUTHORITY_OFFSET = 26;
const PROOF_CONTENT_HASH_OFFSET = 58;
const PROOF_CONTEXT_HASH_OFFSET = 90;
const PROOF_KIND_OFFSET = 122;
const PROOF_STATUS_OFFSET = 123;
const PROOF_CREATED_AT_OFFSET = 124;
const PROOF_REVOKED_AT_OFFSET = 132;
const PROOF_RECORD_READ_BYTES = 140;

const PROOF_KIND_BY_INDEX = [
  "creation",
  "document",
  "agreement",
  "invoice",
  "deliverable",
  "other",
] as const;

export class PpvCoreRequestError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message = code) {
    super(message);
    this.name = "PpvCoreRequestError";
    this.code = code;
    this.status = status;
  }
}

function web3Instruction(spec: InstructionSpec) {
  return new TransactionInstruction({
    programId: new PublicKey(spec.programId),
    keys: spec.accounts.map((account) => ({
      pubkey: new PublicKey(account.address),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(spec.data),
  });
}

function authorityKey(value: string) {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error("non-canonical");
    return key;
  } catch {
    throw new PpvCoreRequestError("INVALID_AUTHORITY", 400);
  }
}

function transactionSignature(value: string) {
  const trimmed = value.trim();
  try {
    if (bs58.decode(trimmed).length !== 64) throw new Error("wrong length");
    return trimmed;
  } catch {
    throw new PpvCoreRequestError("INVALID_TRANSACTION_SIGNATURE", 400);
  }
}

function proofState(
  data: Buffer,
  authority: PublicKey,
  proofId: Uint8Array,
): "active" | "revoked" {
  if (data.length < PROOF_MIN_BYTES || data[PROOF_SCHEMA_OFFSET] !== 1) {
    throw new PpvCoreRequestError("UNEXPECTED_PROOF_ACCOUNT", 409);
  }
  const storedProofId = data.subarray(PROOF_ID_OFFSET, PROOF_ID_OFFSET + 16);
  const storedAuthority = data.subarray(
    PROOF_AUTHORITY_OFFSET,
    PROOF_AUTHORITY_OFFSET + 32,
  );
  if (!storedProofId.equals(Buffer.from(proofId))) {
    throw new PpvCoreRequestError("PROOF_ID_MISMATCH", 409);
  }
  if (!storedAuthority.equals(authority.toBuffer())) {
    throw new PpvCoreRequestError("PROOF_AUTHORITY_MISMATCH", 403);
  }
  const status = data[PROOF_STATUS_OFFSET];
  if (status === 0) return "active";
  if (status === 1) return "revoked";
  throw new PpvCoreRequestError("UNEXPECTED_PROOF_STATUS", 409);
}

function decodeProofRecord(
  data: Buffer,
  authority: PublicKey,
  proofId: Uint8Array,
) {
  if (data.length < PROOF_RECORD_READ_BYTES) {
    throw new PpvCoreRequestError("UNEXPECTED_PROOF_ACCOUNT", 409);
  }

  const state = proofState(data, authority, proofId);
  const kind = PROOF_KIND_BY_INDEX[data[PROOF_KIND_OFFSET]];
  if (!kind) {
    throw new PpvCoreRequestError("UNEXPECTED_PROOF_KIND", 409);
  }

  const createdAtBig = data.readBigInt64LE(PROOF_CREATED_AT_OFFSET);
  const revokedAtBig = data.readBigInt64LE(PROOF_REVOKED_AT_OFFSET);
  const toSafeNumber = (value: bigint, code: string) => {
    if (
      value > BigInt(Number.MAX_SAFE_INTEGER) ||
      value < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new PpvCoreRequestError(code, 409);
    }
    return Number(value);
  };

  return {
    schemaVersion: data[PROOF_SCHEMA_OFFSET],
    proofIdHex: bytesToLowerHex(
      data.subarray(PROOF_ID_OFFSET, PROOF_ID_OFFSET + 16),
    ),
    authority: authority.toBase58(),
    contentHashHex: bytesToLowerHex(
      data.subarray(PROOF_CONTENT_HASH_OFFSET, PROOF_CONTENT_HASH_OFFSET + 32),
    ),
    contextHashHex: bytesToLowerHex(
      data.subarray(PROOF_CONTEXT_HASH_OFFSET, PROOF_CONTEXT_HASH_OFFSET + 32),
    ),
    kind,
    state,
    createdAtUnix: toSafeNumber(createdAtBig, "PROOF_CREATED_AT_OVERFLOW"),
    revokedAtUnix: toSafeNumber(revokedAtBig, "PROOF_REVOKED_AT_OVERFLOW"),
  };
}


function proofAddress(authority: PublicKey, proofId: Uint8Array) {
  return deriveCoreProofRecord(
    PPV_PROGRAM_IDS.core,
    authority.toBase58(),
    proofId,
  );
}

async function coreReadConnection() {
  const config = getPpvObservationConfig();
  if (config.policy.cluster !== "devnet") {
    throw new PpvPolicyError("PPV_DEVNET_REQUIRED");
  }
  if (!config.rpcUrl) throw new PpvPolicyError("PPV_RPC_REQUIRED");
  return new Connection(config.rpcUrl, "finalized");
}

async function coreConnection() {
  const { server } = await requirePpvMutationReadiness(["core"]);
  if (server.policy.cluster !== "devnet") {
    throw new PpvPolicyError("PPV_DEVNET_REQUIRED");
  }
  if (!server.rpcUrl) throw new PpvPolicyError("PPV_RPC_REQUIRED");
  return {
    connection: new Connection(server.rpcUrl, "finalized"),
    rpcProfileId: server.rpcProfileId,
  };
}

export type PrepareCoreProofInput =
  | {
      action: "create";
      authority: string;
      proofIdHex: string;
      contentHashHex: string;
      contextHashHex: string;
      kind: PpvCoreProofKind;
    }
  | {
      action: "revoke";
      authority: string;
      proofIdHex: string;
    };

export async function prepareCoreProofTransaction(input: PrepareCoreProofInput) {
  const authority = authorityKey(input.authority);
  const proofId = fixedHexToBytes(input.proofIdHex, 16, "proofId");
  const proof = proofAddress(authority, proofId);
  const { connection, rpcProfileId } = await coreConnection();

  let spec: InstructionSpec;
  if (input.action === "create") {
    if (!isPpvCoreProofKind(input.kind)) {
      throw new PpvCoreRequestError("INVALID_PROOF_KIND", 400);
    }
    spec = buildCreateProofInstruction({
      programId: PPV_PROGRAM_IDS.core,
      authority: authority.toBase58(),
      proofId,
      contentHash: fixedHexToBytes(input.contentHashHex, 32, "contentHash"),
      contextHash: fixedHexToBytes(input.contextHashHex, 32, "contextHash"),
      kind: input.kind,
    });
  } else {
    const account = await connection.getAccountInfo(new PublicKey(proof), "finalized");
    if (!account) throw new PpvCoreRequestError("PROOF_NOT_FOUND", 404);
    if (!account.owner.equals(new PublicKey(PPV_PROGRAM_IDS.core))) {
      throw new PpvCoreRequestError("WRONG_PROOF_OWNER", 409);
    }
    if (proofState(account.data, authority, proofId) === "revoked") {
      throw new PpvCoreRequestError("PROOF_ALREADY_REVOKED", 409);
    }
    spec = buildRevokeProofInstruction({
      programId: PPV_PROGRAM_IDS.core,
      authority: authority.toBase58(),
      proof,
    });
  }

  const blockhash = await connection.getLatestBlockhash("finalized");
  const transaction = new Transaction({
    feePayer: authority,
    recentBlockhash: blockhash.blockhash,
  }).add(web3Instruction(spec));

  const [balanceLamports, fee, rentLamports] = await Promise.all([
    connection.getBalance(authority, "finalized"),
    connection.getFeeForMessage(transaction.compileMessage(), "finalized"),
    input.action === "create"
      ? connection.getMinimumBalanceForRentExemption(
          PPV_CORE_PROOF_ACCOUNT_BYTES,
          "finalized",
        )
      : Promise.resolve(0),
  ]);
  if (fee.value === null) {
    throw new PpvCoreRequestError(
      "TRANSACTION_FEE_UNAVAILABLE",
      503,
      "PPV could not estimate the devnet transaction fee.",
    );
  }
  const requiredLamports = fee.value + rentLamports;
  if (balanceLamports < requiredLamports) {
    throw new PpvCoreRequestError(
      "INSUFFICIENT_DEVNET_SOL",
      409,
      `This wallet needs at least ${requiredLamports} devnet lamports for this PPV action and currently has ${balanceLamports}.`,
    );
  }

  return {
    action: input.action,
    chain: "solana:devnet" as const,
    proofAddress: proof,
    proofIdHex: input.proofIdHex.toLowerCase(),
    transactionBase64: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    rpcProfileId,
  };
}

export async function confirmCoreProofTransaction(input: {
  action: "create" | "revoke";
  authority: string;
  proofIdHex: string;
  signature: string;
  lastValidBlockHeight?: number;
}) {
  const authority = authorityKey(input.authority);
  const proofId = fixedHexToBytes(input.proofIdHex, 16, "proofId");
  const signature = transactionSignature(input.signature);
  const proof = proofAddress(authority, proofId);
  const { connection } = await coreConnection();

  const transaction = await connection.getParsedTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction) {
    // Transaction-history RPCs can lag even after the program state is visible.
    // Recover from the canonical proof PDA first; the program itself requires
    // the authority signer for both create and revoke.
    const proofAccount = await connection.getAccountInfo(new PublicKey(proof), "finalized");
    if (proofAccount?.owner.equals(new PublicKey(PPV_PROGRAM_IDS.core))) {
      const state = proofState(proofAccount.data, authority, proofId);
      if (
        (input.action === "create" && state === "active") ||
        (input.action === "revoke" && state === "revoked")
      ) {
        return {
          status: "finalized" as const,
          signature,
          proofAddress: proof,
          proofState: state,
          verification: "program_state" as const,
        };
      }
    }

    if (
      Number.isSafeInteger(input.lastValidBlockHeight) &&
      (input.lastValidBlockHeight as number) > 0
    ) {
      const currentBlockHeight = await connection.getBlockHeight("finalized");
      if (currentBlockHeight > (input.lastValidBlockHeight as number)) {
        throw new PpvCoreRequestError("TRANSACTION_EXPIRED", 409);
      }
    }
    return { status: "pending" as const, signature, proofAddress: proof };
  }
  if (transaction.meta?.err) {
    console.warn("ppv_core_transaction_failed", {
      action: input.action,
      signature,
      proofAddress: proof,
      error: JSON.stringify(transaction.meta.err).slice(0, 240),
      logs: (transaction.meta.logMessages ?? [])
        .slice(-8)
        .map((line) => line.slice(0, 240)),
    });
    throw new PpvCoreRequestError(
      "TRANSACTION_FAILED",
      409,
      "The devnet transaction was finalized as failed.",
    );
  }

  const accountKeys = transaction.transaction.message.accountKeys;
  const hasAuthoritySigner = accountKeys.some(
    (account) => account.pubkey.toBase58() === authority.toBase58() && account.signer,
  );
  const addresses = new Set(accountKeys.map((account) => account.pubkey.toBase58()));
  if (
    !hasAuthoritySigner ||
    !addresses.has(PPV_PROGRAM_IDS.core) ||
    !addresses.has(proof)
  ) {
    throw new PpvCoreRequestError("TRANSACTION_DOES_NOT_MATCH_PROOF", 409);
  }

  const account = await connection.getAccountInfo(new PublicKey(proof), "finalized");
  if (!account) throw new PpvCoreRequestError("PROOF_NOT_FOUND", 409);
  if (!account.owner.equals(new PublicKey(PPV_PROGRAM_IDS.core))) {
    throw new PpvCoreRequestError("WRONG_PROOF_OWNER", 409);
  }
  const state = proofState(account.data, authority, proofId);
  if (input.action === "create" && state !== "active") {
    throw new PpvCoreRequestError("PROOF_NOT_ACTIVE", 409);
  }
  if (input.action === "revoke" && state !== "revoked") {
    throw new PpvCoreRequestError("PROOF_NOT_REVOKED", 409);
  }

  return {
    status: "finalized" as const,
    signature,
    proofAddress: proof,
    proofState: state,
    verification: "transaction_and_program_state" as const,
  };
}


export async function readCoreProofRecord(input: {
  authority: string;
  proofIdHex: string;
}) {
  const authority = authorityKey(input.authority);
  const proofId = fixedHexToBytes(input.proofIdHex, 16, "proofId");
  const proof = proofAddress(authority, proofId);
  const connection = await coreReadConnection();
  const account = await connection.getAccountInfo(new PublicKey(proof), "finalized");

  if (!account) throw new PpvCoreRequestError("PROOF_NOT_FOUND", 404);
  if (!account.owner.equals(new PublicKey(PPV_PROGRAM_IDS.core))) {
    throw new PpvCoreRequestError("WRONG_PROOF_OWNER", 409);
  }

  return {
    proofAddress: proof,
    cluster: "devnet" as const,
    ...decodeProofRecord(account.data, authority, proofId),
  };
}
