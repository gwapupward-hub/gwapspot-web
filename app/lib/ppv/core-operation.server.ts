import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  PpvCoreRequestError,
  confirmCoreProofTransaction,
  prepareCoreProofTransaction,
  type PrepareCoreProofInput,
} from "./core.server";
import { getPrivateStorageKey, getWorkspaceRedis } from "../redis";

const OPERATION_TTL_SECONDS = 2 * 60 * 60;
const INTENT_RESERVATION_TTL_SECONDS = 30;
const RESERVATION_READ_ATTEMPTS = 20;
const RESERVATION_READ_DELAY_MS = 50;

type PreparedCoreTransaction = Awaited<
  ReturnType<typeof prepareCoreProofTransaction>
>;

type CoreOperationStatus =
  | "prepared"
  | "submitted"
  | "finalized"
  | "expired"
  | "failed";

type CoreOperationRecord = {
  schemaVersion: 1;
  operationId: string;
  intentDigest: string;
  owner: string;
  action: "create" | "revoke";
  status: CoreOperationStatus;
  signature: string | null;
  proofState: "active" | "revoked" | null;
  prepared: PreparedCoreTransaction;
  createdAt: string;
  updatedAt: string;
};

export type PreparedCoreOperation = PreparedCoreTransaction & {
  operationId: string;
};

function operationKey(operationId: string) {
  return getPrivateStorageKey("ppv-core-operation", operationId);
}

function reservationKey(owner: string, intentDigest: string) {
  return getPrivateStorageKey(
    "ppv-core-intent",
    `${owner}:${intentDigest}`,
  );
}

function normalizeHex(value: string) {
  return value.trim().toLowerCase();
}

function intentDigest(input: PrepareCoreProofInput) {
  const material =
    input.action === "create"
      ? [
          "create",
          input.authority,
          normalizeHex(input.contentHashHex),
          normalizeHex(input.contextHashHex),
          input.kind,
        ]
      : ["revoke", input.authority, normalizeHex(input.proofIdHex)];

  return createHash("sha256").update(material.join("|")).digest("hex");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadOperation(operationId: string) {
  return getWorkspaceRedis().get<CoreOperationRecord>(
    operationKey(operationId),
  );
}

async function saveOperation(record: CoreOperationRecord) {
  await getWorkspaceRedis().set(operationKey(record.operationId), record, {
    ex: OPERATION_TTL_SECONDS,
  });
}

async function loadReservedOperation(
  key: string,
): Promise<CoreOperationRecord | null> {
  const redis = getWorkspaceRedis();

  for (let attempt = 0; attempt < RESERVATION_READ_ATTEMPTS; attempt += 1) {
    const operationId = await redis.get<string>(key);
    if (typeof operationId !== "string" || !operationId) return null;

    const operation = await loadOperation(operationId);
    if (operation) return operation;

    await sleep(RESERVATION_READ_DELAY_MS);
  }

  throw new PpvCoreRequestError(
    "OPERATION_PREPARING",
    409,
    "An identical PPV operation is already being prepared. Retry shortly.",
  );
}

function preparedResponse(record: CoreOperationRecord): PreparedCoreOperation {
  return {
    ...record.prepared,
    operationId: record.operationId,
  };
}

export async function prepareCoreOperation(
  input: PrepareCoreProofInput,
): Promise<PreparedCoreOperation> {
  const redis = getWorkspaceRedis();
  const digest = intentDigest(input);
  const intentKey = reservationKey(input.authority, digest);
  const operationId = randomUUID();

  const reserved = await redis.setIfAbsent(
    intentKey,
    operationId,
    INTENT_RESERVATION_TTL_SECONDS,
  );

  if (!reserved) {
    const existing = await loadReservedOperation(intentKey);
    if (existing) return preparedResponse(existing);
    throw new PpvCoreRequestError(
      "OPERATION_PREPARING",
      409,
      "An identical PPV operation is already being prepared. Retry shortly.",
    );
  }

  try {
    const prepared = await prepareCoreProofTransaction(input);
    const now = new Date().toISOString();
    const record: CoreOperationRecord = {
      schemaVersion: 1,
      operationId,
      intentDigest: digest,
      owner: input.authority,
      action: input.action,
      status: "prepared",
      signature: null,
      proofState: null,
      prepared,
      createdAt: now,
      updatedAt: now,
    };

    await saveOperation(record);
    return preparedResponse(record);
  } catch (error) {
    await redis.deleteIfValue(intentKey, operationId).catch(() => false);
    throw error;
  }
}

export async function confirmCoreOperation(input: {
  operationId?: string;
  action: "create" | "revoke";
  authority: string;
  proofIdHex: string;
  signature: string;
  lastValidBlockHeight?: number;
}) {
  if (!input.operationId) {
    return confirmCoreProofTransaction(input);
  }

  const record = await loadOperation(input.operationId);
  if (!record) {
    throw new PpvCoreRequestError(
      "OPERATION_NOT_FOUND",
      409,
      "The PPV operation record is no longer available.",
    );
  }

  if (
    record.owner !== input.authority ||
    record.action !== input.action ||
    normalizeHex(record.prepared.proofIdHex) !== normalizeHex(input.proofIdHex)
  ) {
    throw new PpvCoreRequestError("OPERATION_MISMATCH", 409);
  }

  if (record.signature && record.signature !== input.signature) {
    throw new PpvCoreRequestError("OPERATION_SIGNATURE_MISMATCH", 409);
  }

  if (record.status === "finalized" && record.proofState) {
    return {
      status: "finalized" as const,
      signature: record.signature ?? input.signature,
      proofAddress: record.prepared.proofAddress,
      proofState: record.proofState,
      verification: "operation_ledger" as const,
    };
  }

  if (record.status === "expired") {
    throw new PpvCoreRequestError("TRANSACTION_EXPIRED", 409);
  }
  if (record.status === "failed") {
    throw new PpvCoreRequestError(
      "TRANSACTION_FAILED",
      409,
      "The devnet transaction was finalized as failed.",
    );
  }

  try {
    const result = await confirmCoreProofTransaction({
      action: record.action,
      authority: record.owner,
      proofIdHex: record.prepared.proofIdHex,
      signature: input.signature,
      lastValidBlockHeight: record.prepared.lastValidBlockHeight,
    });

    await saveOperation({
      ...record,
      status: result.status === "finalized" ? "finalized" : "submitted",
      signature: input.signature,
      proofState:
        result.status === "finalized" ? result.proofState : record.proofState,
      updatedAt: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    if (error instanceof PpvCoreRequestError) {
      const terminal =
        error.code === "TRANSACTION_EXPIRED"
          ? "expired"
          : error.code === "TRANSACTION_FAILED"
            ? "failed"
            : null;

      if (terminal) {
        await saveOperation({
          ...record,
          status: terminal,
          signature: input.signature,
          updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
    }
    throw error;
  }
}
