import "server-only";

import {
  GnsApiError,
  registerGnsIdentity,
  resolveGnsName,
} from "../app/lib/gns";
import type { GnsNetwork } from "../app/lib/gns-registration";
import { updateGwapAccountGnsIdentity } from "./gwap-account";
import { isGwapAccountId } from "./gwap-account-core";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

const REGISTRATION_SYNC_TTL_SECONDS = 24 * 60 * 60;

export type GnsRegistrationSyncStatus =
  | "submitted"
  | "indexing"
  | "active"
  | "failed";

export type GnsRegistrationSyncRecord = {
  accountId: string;
  owner: string;
  name: string;
  txSignature: string;
  network: GnsNetwork;
  status: GnsRegistrationSyncStatus;
  submittedAt: string;
  updatedAt: string;
  attempts: number;
  recovered: boolean;
  error: string | null;
  schemaVersion: 1;
};

function registrationKey(accountId: string) {
  return getPrivateStorageKey("gns-registration-sync", accountId);
}

function validName(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(value);
}

function validSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value);
}

function isNetwork(value: string): value is GnsNetwork {
  return value === "devnet" || value === "testnet" || value === "mainnet-beta";
}

function isRecord(value: unknown): value is GnsRegistrationSyncRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<GnsRegistrationSyncRecord>;
  return (
    isGwapAccountId(record.accountId) &&
    typeof record.owner === "string" &&
    record.owner.length >= 32 &&
    record.owner.length <= 44 &&
    typeof record.name === "string" &&
    validName(record.name) &&
    typeof record.txSignature === "string" &&
    validSignature(record.txSignature) &&
    typeof record.network === "string" &&
    isNetwork(record.network) &&
    (record.status === "submitted" ||
      record.status === "indexing" ||
      record.status === "active" ||
      record.status === "failed") &&
    typeof record.submittedAt === "string" &&
    !Number.isNaN(Date.parse(record.submittedAt)) &&
    typeof record.updatedAt === "string" &&
    !Number.isNaN(Date.parse(record.updatedAt)) &&
    typeof record.attempts === "number" &&
    Number.isSafeInteger(record.attempts) &&
    record.attempts >= 0 &&
    typeof record.recovered === "boolean" &&
    (record.error === null || typeof record.error === "string") &&
    record.schemaVersion === 1
  );
}

export async function getGnsRegistrationSync(accountId: string) {
  if (!isGwapAccountId(accountId)) return null;
  const value = await getWorkspaceRedis().get<unknown>(registrationKey(accountId));
  return isRecord(value) && value.accountId === accountId ? value : null;
}

export async function trackGnsRegistrationSync(input: {
  accountId: string;
  owner: string;
  name: string;
  txSignature: string;
  network: GnsNetwork;
}) {
  if (
    !isGwapAccountId(input.accountId) ||
    !validName(input.name) ||
    !validSignature(input.txSignature) ||
    !isNetwork(input.network)
  ) {
    return null;
  }

  const redis = getWorkspaceRedis();
  const existing = await getGnsRegistrationSync(input.accountId);
  const now = new Date().toISOString();
  const sameReceipt =
    existing?.txSignature === input.txSignature &&
    existing.owner === input.owner &&
    existing.name === input.name &&
    existing.network === input.network;

  const record: GnsRegistrationSyncRecord = {
    accountId: input.accountId,
    owner: input.owner,
    name: input.name,
    txSignature: input.txSignature,
    network: input.network,
    status: sameReceipt ? existing.status : "submitted",
    submittedAt: sameReceipt ? existing.submittedAt : now,
    updatedAt: now,
    attempts: sameReceipt ? existing.attempts : 0,
    recovered: sameReceipt ? existing.recovered : false,
    error: sameReceipt ? existing.error : null,
    schemaVersion: 1,
  };

  await redis.set(registrationKey(input.accountId), record, {
    ex: REGISTRATION_SYNC_TTL_SECONDS,
  });
  return record;
}

async function saveRecord(record: GnsRegistrationSyncRecord) {
  await getWorkspaceRedis().set(registrationKey(record.accountId), record, {
    ex: REGISTRATION_SYNC_TTL_SECONDS,
  });
  return record;
}

async function activateRecord(record: GnsRegistrationSyncRecord, recovered: boolean) {
  await updateGwapAccountGnsIdentity(record.accountId, record.name);
  return saveRecord({
    ...record,
    status: "active",
    updatedAt: new Date().toISOString(),
    recovered,
    error: null,
  });
}

export async function reconcileGnsRegistrationSync(accountId: string) {
  const record = await getGnsRegistrationSync(accountId);
  if (!record || record.status === "active" || record.status === "failed") {
    return record;
  }

  const attempting: GnsRegistrationSyncRecord = {
    ...record,
    status: "indexing",
    attempts: record.attempts + 1,
    updatedAt: new Date().toISOString(),
    error: null,
  };
  await saveRecord(attempting);

  try {
    await registerGnsIdentity({
      name: attempting.name,
      owner: attempting.owner,
      txSignature: attempting.txSignature,
    });

    return activateRecord(attempting, false);
  } catch (error) {
    const resolved = await resolveGnsName(attempting.name);
    if (resolved?.found && resolved.owner === attempting.owner) {
      return activateRecord(attempting, true);
    }

    if (resolved?.found && resolved.owner && resolved.owner !== attempting.owner) {
      return saveRecord({
        ...attempting,
        status: "failed",
        updatedAt: new Date().toISOString(),
        error: "This .gwap name is registered to another wallet.",
      });
    }

    const message =
      error instanceof GnsApiError
        ? error.message
        : "GNS has not indexed the confirmed registration yet.";

    return saveRecord({
      ...attempting,
      status: "indexing",
      updatedAt: new Date().toISOString(),
      error: message.slice(0, 240),
    });
  }
}

export async function clearGnsRegistrationSync(accountId: string) {
  if (!isGwapAccountId(accountId)) return 0;
  return getWorkspaceRedis().del(registrationKey(accountId));
}
