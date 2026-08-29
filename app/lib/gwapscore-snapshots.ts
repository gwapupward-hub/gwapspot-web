import "server-only";

import { randomUUID } from "node:crypto";
import {
  MAX_SNAPSHOT_HISTORY,
  SNAPSHOT_CADENCE_HOURS,
  SNAPSHOT_TTL_SECONDS,
  appendSnapshot,
  nextSnapshotAt,
  normalizeSnapshot,
  normalizeSnapshotHistory,
  type SocialSnapshot,
} from "./gwapscore-snapshot-core";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import type { SocialPlatform } from "./social-proof-control";

export type SnapshotSubject = {
  accountId: string;
  platform: SocialPlatform;
  externalAccountId: string;
  socialHandle: string;
  verifiedAt: string;
  challengeCode: string;
  nextSnapshotAt: string;
  lastSnapshotAt: string | null;
  failures: number;
  updatedAt: string;
};

const REGISTRY_LOCK_TTL_SECONDS = 10;
const MAX_SNAPSHOT_BATCH = 25;
const RETRY_DELAY_MS = 60 * 60 * 1_000;
const MAX_RETRIES_BEFORE_CADENCE = 3;

function registryKey() {
  return getPrivateStorageKey("gwapscore-snapshot-registry", "social");
}
function registryLockKey() {
  return getPrivateStorageKey("gwapscore-snapshot-registry-lock", "social");
}
function latestKey(accountId: string, platform: SocialPlatform) {
  return getPrivateStorageKey("gwapscore-snapshot-latest", `${accountId}:${platform}`);
}
function historyKey(accountId: string, platform: SocialPlatform) {
  return getPrivateStorageKey("gwapscore-snapshot-history", `${accountId}:${platform}`);
}

export function snapshotCollectionEnabled() {
  return (
    process.env.GWAPSCORE_SNAPSHOTS_ENABLED?.trim().toLowerCase() === "true" &&
    Boolean(process.env.GWAPSCORE_X_BEARER_TOKEN?.trim())
  );
}

function normalizeSubject(value: unknown): SnapshotSubject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const subject = value as Partial<SnapshotSubject>;
  if (
    typeof subject.accountId !== "string" ||
    subject.platform !== "x" ||
    typeof subject.externalAccountId !== "string" ||
    !subject.externalAccountId.trim() ||
    typeof subject.socialHandle !== "string" ||
    typeof subject.verifiedAt !== "string" ||
    typeof subject.nextSnapshotAt !== "string" ||
    Number.isNaN(Date.parse(subject.nextSnapshotAt))
  ) {
    return null;
  }
  return {
    accountId: subject.accountId,
    platform: subject.platform,
    externalAccountId: subject.externalAccountId,
    socialHandle: subject.socialHandle,
    verifiedAt: subject.verifiedAt,
    challengeCode: typeof subject.challengeCode === "string" ? subject.challengeCode : "",
    nextSnapshotAt: subject.nextSnapshotAt,
    lastSnapshotAt: typeof subject.lastSnapshotAt === "string" ? subject.lastSnapshotAt : null,
    failures: typeof subject.failures === "number" && subject.failures >= 0 ? subject.failures : 0,
    updatedAt: typeof subject.updatedAt === "string" ? subject.updatedAt : "",
  };
}

async function readRegistry() {
  const stored = await getWorkspaceRedis().get<unknown[]>(registryKey());
  if (!Array.isArray(stored)) return [] as SnapshotSubject[];
  return stored
    .map((entry) => normalizeSubject(entry))
    .filter((entry): entry is SnapshotSubject => Boolean(entry));
}

/**
 * Mirrors the Daily Ideas delivery registry lock: the registry is a single
 * document, so every read-modify-write of it has to be serialized.
 */
async function withRegistryLock<T>(run: () => Promise<T>) {
  const redis = getWorkspaceRedis();
  const token = randomUUID();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await redis.setIfAbsent(registryLockKey(), token, REGISTRY_LOCK_TTL_SECONDS)) {
      try {
        return await run();
      } finally {
        await redis.deleteIfValue(registryLockKey(), token).catch(() => false);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 35 + attempt * 20));
  }
  throw new Error("GwapScore snapshot registry is busy");
}

/**
 * Verified accounts cannot be discovered by key scan (verification keys are
 * hashed), so Proof of Control writes each verified subject here at the moment
 * it becomes observable.
 */
export async function registerSnapshotSubject(input: {
  accountId: string;
  platform: SocialPlatform;
  externalAccountId: string;
  socialHandle: string;
  verifiedAt: string;
  challengeCode: string;
}) {
  if (!input.externalAccountId.trim()) return null;
  const now = new Date();
  return withRegistryLock(async () => {
    const registry = await readRegistry();
    const existing = registry.find(
      (entry) => entry.accountId === input.accountId && entry.platform === input.platform,
    );
    const subject: SnapshotSubject = {
      accountId: input.accountId,
      platform: input.platform,
      externalAccountId: input.externalAccountId.trim(),
      socialHandle: input.socialHandle,
      verifiedAt: input.verifiedAt,
      challengeCode: input.challengeCode,
      // Re-registering the same account keeps its existing cadence slot so a
      // repeat verification cannot be used to force extra X API reads.
      nextSnapshotAt:
        existing && existing.externalAccountId === input.externalAccountId.trim()
          ? existing.nextSnapshotAt
          : now.toISOString(),
      lastSnapshotAt: existing?.lastSnapshotAt ?? null,
      failures: 0,
      updatedAt: now.toISOString(),
    };
    const next = registry.filter(
      (entry) => !(entry.accountId === input.accountId && entry.platform === input.platform),
    );
    next.push(subject);
    await getWorkspaceRedis().set(registryKey(), next);
    return subject;
  });
}

export async function unregisterSnapshotSubject(accountId: string, platform: SocialPlatform) {
  return withRegistryLock(async () => {
    const registry = await readRegistry();
    const next = registry.filter(
      (entry) => !(entry.accountId === accountId && entry.platform === platform),
    );
    if (next.length === registry.length) return false;
    await getWorkspaceRedis().set(registryKey(), next);
    return true;
  });
}

export async function getSnapshotSubject(accountId: string, platform: SocialPlatform) {
  const registry = await readRegistry();
  return (
    registry.find((entry) => entry.accountId === accountId && entry.platform === platform) ?? null
  );
}

/**
 * Claims due subjects and advances their cadence slot in the same locked
 * write, so two concurrent collector runs cannot observe the same slot twice.
 */
export async function claimDueSnapshotSubjects(now = new Date(), limit = 10) {
  const boundedLimit = Math.max(1, Math.min(MAX_SNAPSHOT_BATCH, Math.floor(limit)));
  return withRegistryLock(async () => {
    const registry = await readRegistry();
    const due = registry
      .filter((entry) => Date.parse(entry.nextSnapshotAt) <= now.getTime())
      .sort((left, right) => Date.parse(left.nextSnapshotAt) - Date.parse(right.nextSnapshotAt))
      .slice(0, boundedLimit);

    if (!due.length) return [] as Array<SnapshotSubject & { scheduledFor: string }>;

    const claimedIds = new Set(due.map((entry) => `${entry.accountId}:${entry.platform}`));
    const nextRegistry = registry.map((entry) =>
      claimedIds.has(`${entry.accountId}:${entry.platform}`)
        ? {
            ...entry,
            nextSnapshotAt: nextSnapshotAt(new Date(entry.nextSnapshotAt), SNAPSHOT_CADENCE_HOURS),
            updatedAt: now.toISOString(),
          }
        : entry,
    );
    await getWorkspaceRedis().set(registryKey(), nextRegistry);

    return due.map((entry) => ({ ...entry, scheduledFor: entry.nextSnapshotAt }));
  });
}

/**
 * Writes an immutable snapshot row. Existing rows are never rewritten, and a
 * repeated slot is a no-op, so a retried collector run cannot inflate history.
 */
export async function recordSnapshot(snapshot: SocialSnapshot) {
  const redis = getWorkspaceRedis();
  const key = historyKey(snapshot.accountId, snapshot.platform);
  const history = normalizeSnapshotHistory(await redis.get<unknown>(key));
  const nextHistory = appendSnapshot(history, snapshot);
  if (nextHistory === history) return { stored: false as const, history };

  await Promise.all([
    redis.set(key, nextHistory, { ex: SNAPSHOT_TTL_SECONDS }),
    redis.set(latestKey(snapshot.accountId, snapshot.platform), snapshot, {
      ex: SNAPSHOT_TTL_SECONDS,
    }),
  ]);
  return { stored: true as const, history: nextHistory };
}

export async function recordSnapshotOutcome(input: {
  accountId: string;
  platform: SocialPlatform;
  collectedAt: string;
  succeeded: boolean;
}) {
  const now = new Date();
  await withRegistryLock(async () => {
    const registry = await readRegistry();
    const index = registry.findIndex(
      (entry) => entry.accountId === input.accountId && entry.platform === input.platform,
    );
    if (index < 0) return;
    const current = registry[index];
    const failures = input.succeeded ? 0 : current.failures + 1;
    registry[index] = {
      ...current,
      failures,
      lastSnapshotAt: input.succeeded ? input.collectedAt : current.lastSnapshotAt,
      // A failed read retries in an hour a few times before falling back to the
      // normal cadence, so a broken credential does not hammer the X API.
      nextSnapshotAt:
        input.succeeded || failures >= MAX_RETRIES_BEFORE_CADENCE
          ? current.nextSnapshotAt
          : new Date(now.getTime() + RETRY_DELAY_MS).toISOString(),
      updatedAt: now.toISOString(),
    };
    await getWorkspaceRedis().set(registryKey(), registry);
  });
}

export async function getLatestSnapshot(accountId: string, platform: SocialPlatform) {
  return normalizeSnapshot(await getWorkspaceRedis().get<unknown>(latestKey(accountId, platform)));
}

export async function listSnapshotHistory(
  accountId: string,
  platform: SocialPlatform,
  input: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const limit = Math.min(MAX_SNAPSHOT_HISTORY, Math.max(1, Math.floor(input.limit || 30)));
  const entries = normalizeSnapshotHistory(
    await getWorkspaceRedis().get<unknown>(historyKey(accountId, platform)),
  );
  const items = entries.slice(offset, offset + limit);
  const nextOffset = offset + items.length < entries.length ? offset + items.length : null;
  return { items, all: entries, total: entries.length, offset, limit, nextOffset };
}
