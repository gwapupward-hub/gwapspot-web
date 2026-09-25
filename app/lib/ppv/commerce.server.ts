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
  buildCancelCommerceAgreementInstruction,
  buildCreateCommerceAgreementInstruction,
  buildReviseCommerceAgreementInstruction,
  buildSignCommerceAgreementInstruction,
  deriveCommerceAgreement,
  type InstructionSpec,
} from "../ppv-sdk/instructions";
import { decodeAgreement, type AgreementState } from "../ppv-reputation-accounts";
import { getPpvObservationConfig } from "./config.server";
import { PPV_PROGRAM_IDS, PpvPolicyError } from "./policy";
import { requirePpvMutationReadiness } from "./readiness.server";

const AGREEMENT_ACCOUNT_BYTES = 473;
const MAX_AGREEMENT_TTL_SECONDS = 365 * 24 * 60 * 60;
const HEX_16 = /^[0-9a-f]{32}$/;
const HEX_32 = /^[0-9a-f]{64}$/;

export class PpvCommerceRequestError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message = code) {
    super(message);
    this.name = "PpvCommerceRequestError";
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

function publicKey(value: string, code = "INVALID_WALLET") {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error("non-canonical");
    return key;
  } catch {
    throw new PpvCommerceRequestError(code, 400);
  }
}

function transactionSignature(value: string) {
  const trimmed = value.trim();
  try {
    if (bs58.decode(trimmed).length !== 64) throw new Error("wrong length");
    return trimmed;
  } catch {
    throw new PpvCommerceRequestError("INVALID_TRANSACTION_SIGNATURE", 400);
  }
}

function hexBytes(value: string, bytes: 16 | 32, code: string) {
  const normalized = value.trim().toLowerCase();
  const pattern = bytes === 16 ? HEX_16 : HEX_32;
  if (!pattern.test(normalized)) {
    throw new PpvCommerceRequestError(code, 400);
  }
  const out = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) {
    out[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function nonZeroHash(value: string, code: string) {
  const bytes = hexBytes(value, 32, code);
  if (bytes.every((byte) => byte === 0)) {
    throw new PpvCommerceRequestError(code, 400);
  }
  return bytes;
}

function agreementAddress(partyA: PublicKey, agreementId: Uint8Array) {
  return deriveCommerceAgreement(
    PPV_PROGRAM_IDS.commerce,
    partyA.toBase58(),
    agreementId,
  );
}

function assertParty(record: AgreementState, authority: PublicKey) {
  const address = authority.toBase58();
  if (record.partyA !== address && record.partyB !== address) {
    throw new PpvCommerceRequestError("NOT_A_PARTY", 403);
  }
}

function assertPending(record: AgreementState) {
  if (record.state !== "pending") {
    throw new PpvCommerceRequestError("AGREEMENT_NOT_PENDING", 409);
  }
}

function assertExpectedVersion(record: AgreementState, expectedVersion: number) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) {
    throw new PpvCommerceRequestError("INVALID_VERSION", 400);
  }
  if (record.version !== expectedVersion) {
    throw new PpvCommerceRequestError("STALE_VERSION", 409);
  }
}

async function commerceReadConnection() {
  const config = getPpvObservationConfig();
  if (config.policy.cluster !== "devnet") {
    throw new PpvPolicyError("PPV_DEVNET_REQUIRED");
  }
  if (!config.rpcUrl) throw new PpvPolicyError("PPV_RPC_REQUIRED");
  return new Connection(config.rpcUrl, "finalized");
}

async function commerceConnection() {
  const { server } = await requirePpvMutationReadiness(["commerce"]);
  if (server.policy.cluster !== "devnet") {
    throw new PpvPolicyError("PPV_DEVNET_REQUIRED");
  }
  if (!server.rpcUrl) throw new PpvPolicyError("PPV_RPC_REQUIRED");
  return {
    connection: new Connection(server.rpcUrl, "finalized"),
    rpcProfileId: server.rpcProfileId,
  };
}

async function chainUnixTime(connection: Connection) {
  const slot = await connection.getSlot("finalized");
  const time = await connection.getBlockTime(slot);
  if (time === null) {
    throw new PpvCommerceRequestError(
      "CHAIN_TIME_UNAVAILABLE",
      503,
      "PPV could not read finalized chain time.",
    );
  }
  return time;
}

async function readAgreementAccount(
  connection: Connection,
  partyA: PublicKey,
  agreementId: Uint8Array,
) {
  const address = agreementAddress(partyA, agreementId);
  const account = await connection.getAccountInfo(new PublicKey(address), "finalized");
  if (!account) throw new PpvCommerceRequestError("AGREEMENT_NOT_FOUND", 404);
  if (!account.owner.equals(new PublicKey(PPV_PROGRAM_IDS.commerce))) {
    throw new PpvCommerceRequestError("WRONG_AGREEMENT_OWNER", 409);
  }
  const record = decodeAgreement(new Uint8Array(account.data));
  if (!record || record.schemaVersion !== 1) {
    throw new PpvCommerceRequestError("UNEXPECTED_AGREEMENT_ACCOUNT", 409);
  }
  return { address, record };
}

export type PrepareCommerceInput =
  | {
      action: "create";
      authority: string;
      agreementIdHex: string;
      partyB: string;
      contentHashHex: string;
      termsHashHex: string;
      expiresAtUnix: number;
    }
  | {
      action: "revise";
      authority: string;
      partyA: string;
      agreementIdHex: string;
      expectedVersion: number;
      contentHashHex: string;
      termsHashHex: string;
    }
  | {
      action: "sign";
      authority: string;
      partyA: string;
      agreementIdHex: string;
      expectedVersion: number;
      contentHashHex: string;
      termsHashHex: string;
    }
  | {
      action: "cancel";
      authority: string;
      partyA: string;
      agreementIdHex: string;
    };

export type PreparedCommerceTransaction = {
  action: PrepareCommerceInput["action"];
  chain: "solana:devnet";
  agreementAddress: string;
  agreementIdHex: string;
  partyA: string;
  partyB: string;
  currentVersion: number;
  resultingVersion: number;
  contentHashHex: string;
  termsHashHex: string;
  transactionBase64: string;
  blockhash: string;
  lastValidBlockHeight: number;
  rpcProfileId: string;
};

export async function readCommerceAgreement(input: {
  authority: string;
  partyA: string;
  agreementIdHex: string;
}) {
  const authority = publicKey(input.authority);
  const partyA = publicKey(input.partyA, "INVALID_PARTY_A");
  const agreementId = hexBytes(input.agreementIdHex, 16, "INVALID_AGREEMENT_ID");
  const connection = await commerceReadConnection();
  const { address, record } = await readAgreementAccount(connection, partyA, agreementId);
  assertParty(record, authority);
  return {
    cluster: "devnet" as const,
    agreementAddress: address,
    ...record,
  };
}

export async function prepareCommerceTransaction(
  input: PrepareCommerceInput,
): Promise<PreparedCommerceTransaction> {
  const authority = publicKey(input.authority);
  const agreementId = hexBytes(input.agreementIdHex, 16, "INVALID_AGREEMENT_ID");
  const { connection, rpcProfileId } = await commerceConnection();

  let partyA: PublicKey;
  let partyB: PublicKey;
  let address: string;
  let currentVersion = 0;
  let resultingVersion = 1;
  let contentHashHex: string;
  let termsHashHex: string;
  let spec: InstructionSpec;

  if (input.action === "create") {
    partyA = authority;
    partyB = publicKey(input.partyB, "INVALID_PARTY_B");
    if (partyA.equals(partyB)) {
      throw new PpvCommerceRequestError("INVALID_PARTY_B", 400);
    }

    const contentHash = nonZeroHash(input.contentHashHex, "INVALID_CONTENT_HASH");
    const termsHash = nonZeroHash(input.termsHashHex, "INVALID_TERMS_HASH");
    const now = await chainUnixTime(connection);
    if (
      !Number.isSafeInteger(input.expiresAtUnix) ||
      input.expiresAtUnix <= now ||
      input.expiresAtUnix > now + MAX_AGREEMENT_TTL_SECONDS
    ) {
      throw new PpvCommerceRequestError("INVALID_EXPIRY", 400);
    }

    address = agreementAddress(partyA, agreementId);
    const existing = await connection.getAccountInfo(new PublicKey(address), "finalized");
    if (existing) throw new PpvCommerceRequestError("AGREEMENT_ALREADY_EXISTS", 409);

    contentHashHex = input.contentHashHex.toLowerCase();
    termsHashHex = input.termsHashHex.toLowerCase();
    spec = buildCreateCommerceAgreementInstruction({
      programId: PPV_PROGRAM_IDS.commerce,
      partyA: partyA.toBase58(),
      partyB: partyB.toBase58(),
      agreementId,
      contentHash,
      termsHash,
      expiresAt: String(input.expiresAtUnix),
    });
  } else {
    partyA = publicKey(input.partyA, "INVALID_PARTY_A");
    const current = await readAgreementAccount(connection, partyA, agreementId);
    address = current.address;
    partyB = publicKey(current.record.partyB, "INVALID_PARTY_B");
    assertParty(current.record, authority);
    assertPending(current.record);
    currentVersion = current.record.version;
    resultingVersion =
      input.action === "revise" ? current.record.version + 1 : current.record.version;

    if (input.action === "cancel") {
      contentHashHex = current.record.contentHash;
      termsHashHex = current.record.termsHash;
      spec = buildCancelCommerceAgreementInstruction({
        programId: PPV_PROGRAM_IDS.commerce,
        signer: authority.toBase58(),
        agreement: address,
      });
    } else {
      assertExpectedVersion(current.record, input.expectedVersion);
      const contentHash = nonZeroHash(input.contentHashHex, "INVALID_CONTENT_HASH");
      const termsHash = nonZeroHash(input.termsHashHex, "INVALID_TERMS_HASH");
      contentHashHex = input.contentHashHex.toLowerCase();
      termsHashHex = input.termsHashHex.toLowerCase();

      if (input.action === "sign") {
        if (
          current.record.contentHash !== contentHashHex ||
          current.record.termsHash !== termsHashHex
        ) {
          throw new PpvCommerceRequestError("AGREEMENT_HASH_MISMATCH", 409);
        }
        const ownSignature =
          current.record.partyA === authority.toBase58()
            ? current.record.sigA
            : current.record.sigB;
        if (ownSignature) {
          throw new PpvCommerceRequestError("ALREADY_SIGNED", 409);
        }
        spec = buildSignCommerceAgreementInstruction({
          programId: PPV_PROGRAM_IDS.commerce,
          signer: authority.toBase58(),
          agreement: address,
          expectedVersion: input.expectedVersion,
          contentHash,
          termsHash,
        });
      } else {
        if (
          current.record.contentHash === contentHashHex &&
          current.record.termsHash === termsHashHex
        ) {
          throw new PpvCommerceRequestError("NO_CHANGES", 409);
        }
        spec = buildReviseCommerceAgreementInstruction({
          programId: PPV_PROGRAM_IDS.commerce,
          signer: authority.toBase58(),
          agreement: address,
          expectedVersion: input.expectedVersion,
          contentHash,
          termsHash,
        });
      }
    }
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
          AGREEMENT_ACCOUNT_BYTES,
          "finalized",
        )
      : Promise.resolve(0),
  ]);

  if (fee.value === null) {
    throw new PpvCommerceRequestError(
      "TRANSACTION_FEE_UNAVAILABLE",
      503,
      "PPV could not estimate the devnet transaction fee.",
    );
  }
  const requiredLamports = fee.value + rentLamports;
  if (balanceLamports < requiredLamports) {
    throw new PpvCommerceRequestError(
      "INSUFFICIENT_DEVNET_SOL",
      409,
      `This wallet needs at least ${requiredLamports} devnet lamports for this Commerce action and currently has ${balanceLamports}.`,
    );
  }

  return {
    action: input.action,
    chain: "solana:devnet",
    agreementAddress: address,
    agreementIdHex: input.agreementIdHex.toLowerCase(),
    partyA: partyA.toBase58(),
    partyB: partyB.toBase58(),
    currentVersion,
    resultingVersion,
    contentHashHex,
    termsHashHex,
    transactionBase64: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    rpcProfileId,
  };
}

function actionSatisfied(input: {
  prepared: PreparedCommerceTransaction;
  authority: PublicKey;
  record: AgreementState;
}) {
  const { prepared, authority, record } = input;
  if (record.partyA !== prepared.partyA || record.partyB !== prepared.partyB) return false;

  if (prepared.action === "create") {
    return (
      record.version === 1 &&
      record.state === "pending" &&
      record.contentHash === prepared.contentHashHex &&
      record.termsHash === prepared.termsHashHex
    );
  }

  if (prepared.action === "revise") {
    return (
      record.version === prepared.resultingVersion &&
      record.state === "pending" &&
      record.contentHash === prepared.contentHashHex &&
      record.termsHash === prepared.termsHashHex &&
      record.sigA === null &&
      record.sigB === null
    );
  }

  if (prepared.action === "sign") {
    const signature =
      record.partyA === authority.toBase58() ? record.sigA : record.sigB;
    return (
      signature?.signer === authority.toBase58() &&
      signature.versionSigned === prepared.currentVersion &&
      signature.contentHashSigned === prepared.contentHashHex &&
      signature.termsHashSigned === prepared.termsHashHex
    );
  }

  return record.state === "cancelled";
}

export async function confirmCommerceTransaction(input: {
  prepared: PreparedCommerceTransaction;
  authority: string;
  signature: string;
}) {
  const authority = publicKey(input.authority);
  const signature = transactionSignature(input.signature);
  const { connection } = await commerceConnection();
  const agreement = new PublicKey(input.prepared.agreementAddress);

  const transaction = await connection.getParsedTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction) {
    const account = await connection.getAccountInfo(agreement, "finalized");
    if (account?.owner.equals(new PublicKey(PPV_PROGRAM_IDS.commerce))) {
      const record = decodeAgreement(new Uint8Array(account.data));
      if (
        record &&
        actionSatisfied({
          prepared: input.prepared,
          authority,
          record,
        })
      ) {
        return {
          status: "finalized" as const,
          signature,
          agreementAddress: input.prepared.agreementAddress,
          agreement: record,
          verification: "program_state" as const,
        };
      }
    }

    const currentBlockHeight = await connection.getBlockHeight("finalized");
    if (currentBlockHeight > input.prepared.lastValidBlockHeight) {
      throw new PpvCommerceRequestError("TRANSACTION_EXPIRED", 409);
    }
    return {
      status: "pending" as const,
      signature,
      agreementAddress: input.prepared.agreementAddress,
    };
  }

  if (transaction.meta?.err) {
    console.warn("ppv_commerce_transaction_failed", {
      action: input.prepared.action,
      signature,
      agreementAddress: input.prepared.agreementAddress,
      error: JSON.stringify(transaction.meta.err).slice(0, 240),
      logs: (transaction.meta.logMessages ?? [])
        .slice(-8)
        .map((line) => line.slice(0, 240)),
    });
    throw new PpvCommerceRequestError(
      "TRANSACTION_FAILED",
      409,
      "The devnet Commerce transaction was finalized as failed.",
    );
  }

  const accountKeys = transaction.transaction.message.accountKeys;
  const hasAuthoritySigner = accountKeys.some(
    (account) => account.pubkey.toBase58() === authority.toBase58() && account.signer,
  );
  const addresses = new Set(accountKeys.map((account) => account.pubkey.toBase58()));
  if (
    !hasAuthoritySigner ||
    !addresses.has(PPV_PROGRAM_IDS.commerce) ||
    !addresses.has(input.prepared.agreementAddress)
  ) {
    throw new PpvCommerceRequestError(
      "TRANSACTION_DOES_NOT_MATCH_AGREEMENT",
      409,
    );
  }

  const account = await connection.getAccountInfo(agreement, "finalized");
  if (!account) throw new PpvCommerceRequestError("AGREEMENT_NOT_FOUND", 409);
  if (!account.owner.equals(new PublicKey(PPV_PROGRAM_IDS.commerce))) {
    throw new PpvCommerceRequestError("WRONG_AGREEMENT_OWNER", 409);
  }
  const record = decodeAgreement(new Uint8Array(account.data));
  if (!record || !actionSatisfied({ prepared: input.prepared, authority, record })) {
    throw new PpvCommerceRequestError("AGREEMENT_STATE_MISMATCH", 409);
  }

  return {
    status: "finalized" as const,
    signature,
    agreementAddress: input.prepared.agreementAddress,
    agreement: record,
    verification: "transaction_and_program_state" as const,
  };
}
