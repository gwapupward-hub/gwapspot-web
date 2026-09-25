import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getPrivateStorageKey, getWorkspaceRedis } from "../redis";
import {
  PpvCommerceRequestError,
  confirmCommerceTransaction,
  prepareCommerceTransaction,
  type PrepareCommerceInput,
  type PreparedCommerceTransaction,
} from "./commerce.server";

const OPERATION_TTL_SECONDS = 2 * 60 * 60;
const INTENT_RESERVATION_TTL_SECONDS = 30;
const RESERVATION_READ_ATTEMPTS = 20;
const RESERVATION_READ_DELAY_MS = 50;

type CommerceOperationStatus =
  | "prepared"
  | "submitted"
  | "finalized"
  | "expired"
  | "failed";

type CommerceOperationRecord = {
  schemaVersion: 1;
  operationId: string;
  intentDigest: string;
  owner: string;
  action: PrepareCommerceInput["action"];
  status: CommerceOperationStatus;
  signature: string | null;
  prepared: PreparedCommerceTransaction;
  createdAt: string;
  updatedAt: string;
};

export type PreparedCommerceOperation = PreparedCommerceTransaction & {
  operationId: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function operationKey(operationId: string) {
  return getPrivateStorageKey("ppv-commerce-operation", operationId);
}

function reservationKey(owner: string, digest: string) {
  return getPrivateStorageKey("ppv-commerce-intent", `${owner}:${digest}`);
}

function digestIntent(input: PrepareCommerceInput) {
  const material =
    input.action === "create"
      ? [
          input.action,
          input.authority,
          normalize(input.partyB),
          normalize(input.contentHashHex),
          normalize(input.termsHashHex),
          String(input.expiresAtUnix),
        ]
      : input.action === "cancel"
        ? [
            input.action,
            input.authority,
            normalize(input.partyA),
            normalize(input.agreementIdHex),
          ]
        : [
            input.action,
            input.authority,
            normalize(input.partyA),
            normalize(input.agreementIdHex),
            String(input.expectedVersion),
            normalize(input.contentHashHex),
            normalize(input.termsHashHex),
          ];

  return createHash("sha256").update(material.join("|")).digest("hex");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadOperation(operationId: string) {
  return getWorkspaceRedis().get<CommerceOperationRecord>(
    operationKey(operationId),
  );
}

async function saveOperation(record: CommerceOperationRecord) {
  await getWorkspaceRedis().set(operationKey(record.operationId), record, {
    ex: OPERATION_TTL_SECONDS,
  });
}

async function loadReservedOperation(key: string) {
  const redis = getWorkspaceRedis();

  for (let attempt = 0; attempt < RESERVATION_READ_ATTEMPTS; attempt += 1) {
    const operationId = await redis.get<string>(key);
    if (typeof operationId !== "string" || !operationId) return null;
    const operation = await loadOperation(operationId);
    if (operation) return operation;
    await sleep(RESERVATION_READ_DELAY_MS);
  }

  throw new PpvCommerceRequestError(
    "OPERATION_PREPARING",
    409,
    "An identical Commerce operation is already being prepared. Retry shortly.",
  );
}

function response(record: CommerceOperationRecord): PreparedCommerceOperation {
  return { ...record.prepared, operationId: record.operationId };
}

export async function prepareCommerceOperation(
  input: PrepareCommerceInput,
): Promise<PreparedCommerceOperation> {
  const redis = getWorkspaceRedis();
  const digest = digestIntent(input);
  const intentKey = reservationKey(input.authority, digest);
  const operationId = randomUUID();

  const reserved = await redis.setIfAbsent(
    intentKey,
    operationId,
    INTENT_RESERVATION_TTL_SECONDS,
  );

  if (!reserved) {
    const existing = await loadReservedOperation(intentKey);
    if (existing) return response(existing);
    throw new PpvCommerceRequestError("OPERATION_PREPARING", 409);
  }

  try {
    const prepared = await prepareCommerceTransaction(input);
    const now = new Date().toISOString();
    const record: CommerceOperationRecord = {
      schemaVersion: 1,
      operationId,
      intentDigest: digest,
      owner: input.authority,
      action: input.action,
      status: "prepared",
      signature: null,
      prepared,
      createdAt: now,
      updatedAt: now,
    };
    await saveOperation(record);
    return response(record);
  } catch (error) {
    await redis.deleteIfValue(intentKey, operationId).catch(() => false);
    throw error;
  }
}

export async function confirmCommerceOperation(input: {
  operationId: string;
  authority: string;
  signature: string;
}) {
  const record = await loadOperation(input.operationId);
  if (!record) {
    throw new PpvCommerceRequestError(
      "OPERATION_NOT_FOUND",
      409,
      "The Commerce operation record is no longer available.",
    );
  }
  if (record.owner !== input.authority) {
    throw new PpvCommerceRequestError("OPERATION_MISMATCH", 409);
  }
  if (record.signature && record.signature !== input.signature) {
    throw new PpvCommerceRequestError("OPERATION_SIGNATURE_MISMATCH", 409);
  }
  if (record.status === "finalized") {
    const result = await confirmCommerceTransaction({
      prepared: record.prepared,
      authority: record.owner,
      signature: record.signature ?? input.signature,
    });
    if (result.status !== "finalized") {
      throw new PpvCommerceRequestError("OPERATION_STATE_MISMATCH", 409);
    }
    return { ...result, verification: "operation_ledger" as const };
  }
  if (record.status === "expired") {
    throw new PpvCommerceRequestError("TRANSACTION_EXPIRED", 409);
  }
  if (record.status === "failed") {
    throw new PpvCommerceRequestError(
      "TRANSACTION_FAILED",
      409,
      "The Commerce transaction was finalized as failed.",
    );
  }

  try {
    const result = await confirmCommerceTransaction({
      prepared: record.prepared,
      authority: record.owner,
      signature: input.signature,
    });

    await saveOperation({
      ...record,
      signature: input.signature,
      status: result.status === "finalized" ? "finalized" : "submitted",
      updatedAt: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    if (error instanceof PpvCommerceRequestError) {
      const terminal =
        error.code === "TRANSACTION_EXPIRED"
          ? "expired"
          : error.code === "TRANSACTION_FAILED"
            ? "failed"
            : null;
      if (terminal) {
        await saveOperation({
          ...record,
          signature: input.signature,
          status: terminal,
          updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
    }
    throw error;
  }
}
