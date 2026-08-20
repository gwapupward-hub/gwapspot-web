import "server-only";

import {
  GnsApiError,
  registerGnsIdentity,
  resolveGnsName,
} from "../app/lib/gns";
import type { GnsNetwork } from "../app/lib/gns-registration";
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

function validAccountId(value: string) {
  return /^gwap_[a-f0-9]{24}$/.test(value);
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
    typeof record.accountId === "string" &&
    validAccountId(record.accountId) &&
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
  if (!validAccountId(accountId)) return null;
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
    !validAccountId(input.accountId) ||
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

    return saveRecord({
      ...attempting,
      status: "active",
      updatedAt: new Date().toISOString(),
      recovered: false,
      error: null,
    });
  } catch (error) {
    const resolved = await resolveGnsName(attempting.name);
    if (resolved?.found && resolved.owner === attempting.owner) {
      return saveRecord({
        ...attempting,
        status: "active",
        updatedAt: new Date().toISOString(),
        recovered: true,
        error: null,
      });
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
  if (!validAccountId(accountId)) return 0;
  return getWorkspaceRedis().del(registrationKey(accountId));
}
