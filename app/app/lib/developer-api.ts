import "server-only";

import {
  createDeveloperApiKeyMaterial,
  getDeveloperPlanLimits,
  getDeveloperUsageWindow,
  hashDeveloperApiKey,
  isDeveloperApiKeyFormat,
  type DeveloperPlan,
} from "../../lib/developer-api-core";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../lib/redis";
import { withWorkspaceLock } from "../../lib/workspace-lock";
import { resolveDeveloperPlan } from "./developer-billing";

const MAX_KEYS_PER_OWNER = 3;
const DAILY_ANALYTICS_TTL_SECONDS = 45 * 24 * 60 * 60;

type DeveloperKeyStatus = "active" | "revoked";

type DeveloperKeyRecord = {
  id: string;
  ownerId: string;
  label: string;
  preview: string;
  plan: DeveloperPlan;
  status: DeveloperKeyStatus;
  createdAt: string;
  revokedAt: string | null;
};

export type DeveloperKeySummary = Omit<DeveloperKeyRecord, "ownerId">;

type StoredDeveloperKeySummary = DeveloperKeySummary & {
  storageHash?: string;
};

export type DeveloperUsage = {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

export type DeveloperKeyView = DeveloperKeySummary & {
  usage: DeveloperUsage;
};

type DeveloperAccountRecord = {
  ownerId: string;
  keys: StoredDeveloperKeySummary[];
};

export type DeveloperApiAuthorization = {
  allowed: boolean;
  status: 200 | 401 | 429 | 503;
  error: string | null;
  keyId: string | null;
  ownerId: string | null;
  plan: DeveloperPlan | null;
  usage: DeveloperUsage | null;
};

function ownerStorageKey(ownerId: string) {
  return getPrivateStorageKey("developer-account", ownerId);
}

function ownerLockKey(ownerId: string) {
  return getPrivateStorageKey("developer-account-lock", ownerId);
}

function apiKeyStorageKey(hash: string) {
  return getPrivateStorageKey("developer-key", hash);
}

function usageStorageKey(ownerId: string, windowId: string) {
  return getPrivateStorageKey("developer-usage-account", `${ownerId}:${windowId}`);
}

function dailyUsageStorageKey(ownerId: string, dateId: string) {
  return getPrivateStorageKey("developer-usage-day", `${ownerId}:${dateId}`);
}

function minuteStorageKey(keyId: string, minute: number) {
  return getPrivateStorageKey("developer-minute", `${keyId}:${minute}`);
}

function sanitizeLabel(value: unknown) {
  if (typeof value !== "string") return "Default";
  const label = value.trim().replace(/\s+/g, " ").slice(0, 48);
  return label || "Default";
}

function utcDateId(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function publicKeySummary(key: StoredDeveloperKeySummary): DeveloperKeySummary {
  return {
    id: key.id,
    label: key.label,
    preview: key.preview,
    plan: key.plan,
    status: key.status,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt,
  };
}

async function readAccount(ownerId: string): Promise<DeveloperAccountRecord> {
  const redis = getWorkspaceRedis();
  return (
    (await redis.get<DeveloperAccountRecord>(ownerStorageKey(ownerId))) || {
      ownerId,
      keys: [],
    }
  );
}

async function getAccountUsage(ownerId: string, plan: DeveloperPlan) {
  const redis = getWorkspaceRedis();
  const window = getDeveloperUsageWindow();
  const rawUsed = await redis.get<number | string>(usageStorageKey(ownerId, window.id));
  const usedValue = Number(rawUsed ?? 0);
  const used = Number.isFinite(usedValue) && usedValue > 0 ? Math.floor(usedValue) : 0;
  const limits = getDeveloperPlanLimits(plan);
  return {
    used,
    limit: limits.requestsPerMonth,
    remaining: Math.max(0, limits.requestsPerMonth - used),
    resetAt: window.reset.toISOString(),
  } satisfies DeveloperUsage;
}

export async function getDeveloperApiAccount(ownerId: string) {
  const [account, plan] = await Promise.all([
    readAccount(ownerId),
    resolveDeveloperPlan(ownerId),
  ]);
  const usage = await getAccountUsage(ownerId, plan);
  const keys: DeveloperKeyView[] = account.keys.map((key) => ({
    ...publicKeySummary(key),
    plan,
    usage,
  }));
  return { plan, usage, keys };
}

export async function listDeveloperApiKeys(ownerId: string) {
  return (await getDeveloperApiAccount(ownerId)).keys;
}

export async function getDeveloperUsageAnalytics(ownerId: string, days = 30) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const today = new Date();
  const dates = Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - (safeDays - 1 - index),
    ));
    return utcDateId(date);
  });
  const redis = getWorkspaceRedis();
  const values = await Promise.all(
    dates.map((date) => redis.get<number | string>(dailyUsageStorageKey(ownerId, date))),
  );

  return dates.map((date, index) => {
    const parsed = Number(values[index] ?? 0);
    return {
      date,
      requests: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0,
    };
  });
}

export async function createDeveloperApiKey(ownerId: string, label?: unknown) {
  const redis = getWorkspaceRedis();
  return withWorkspaceLock(redis, ownerLockKey(ownerId), async () => {
    const [account, plan] = await Promise.all([
      readAccount(ownerId),
      resolveDeveloperPlan(ownerId),
    ]);
    const activeCount = account.keys.filter((key) => key.status === "active").length;
    if (activeCount >= MAX_KEYS_PER_OWNER) throw new Error("API_KEY_LIMIT");

    const material = createDeveloperApiKeyMaterial();
    const record: DeveloperKeyRecord = {
      id: material.id,
      ownerId,
      label: sanitizeLabel(label),
      preview: material.preview,
      plan,
      status: "active",
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    const summary: DeveloperKeySummary = {
      id: record.id,
      label: record.label,
      preview: record.preview,
      plan: record.plan,
      status: record.status,
      createdAt: record.createdAt,
      revokedAt: record.revokedAt,
    };
    const storedSummary: StoredDeveloperKeySummary = {
      ...summary,
      storageHash: material.hash,
    };
    const keyStorage = apiKeyStorageKey(material.hash);

    await redis.set(keyStorage, record);
    try {
      await redis.set(ownerStorageKey(ownerId), {
        ownerId,
        keys: [...account.keys, storedSummary],
      } satisfies DeveloperAccountRecord);
    } catch (error) {
      await redis.del(keyStorage).catch(() => 0);
      throw error;
    }

    return { apiKey: material.apiKey, key: summary };
  });
}

export async function revokeDeveloperApiKey(ownerId: string, keyId: string) {
  const redis = getWorkspaceRedis();
  return withWorkspaceLock(redis, ownerLockKey(ownerId), async () => {
    const account = await readAccount(ownerId);
    const target = account.keys.find((key) => key.id === keyId);
    if (!target || target.status !== "active") return false;

    const revokedAt = new Date().toISOString();
    const keys = account.keys.map((key) =>
      key.id === keyId ? { ...key, status: "revoked" as const, revokedAt } : key,
    );
    await redis.set(ownerStorageKey(ownerId), {
      ownerId,
      keys,
    } satisfies DeveloperAccountRecord);
    return true;
  });
}

export async function deleteDeveloperApiAccount(ownerId: string) {
  const redis = getWorkspaceRedis();
  return withWorkspaceLock(redis, ownerLockKey(ownerId), async () => {
    const account = await readAccount(ownerId);
    const now = new Date();
    const priorMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15),
    );
    const usageWindows = new Set([
      getDeveloperUsageWindow(now).id,
      getDeveloperUsageWindow(priorMonth).id,
    ]);
    const dates = Array.from({ length: 45 }, (_, index) => {
      const date = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - index,
        ),
      );
      return utcDateId(date);
    });
    const minute = Math.floor(Date.now() / 60_000);
    const relatedKeys = new Set<string>([
      ...Array.from(usageWindows, (windowId) => usageStorageKey(ownerId, windowId)),
      ...dates.map((date) => dailyUsageStorageKey(ownerId, date)),
      ...account.keys.flatMap((key) => [
        minuteStorageKey(key.id, minute),
        minuteStorageKey(key.id, minute - 1),
        ...(key.storageHash ? [apiKeyStorageKey(key.storageHash)] : []),
      ]),
    ]);

    await Promise.all(Array.from(relatedKeys, (key) => redis.del(key)));
    await redis.del(ownerStorageKey(ownerId));
  });
}

function extractApiKey(request: Request) {
  const direct = request.headers.get("x-api-key")?.trim();
  if (direct) return direct;
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

export async function authorizeDeveloperApiRequest(
  request: Request,
): Promise<DeveloperApiAuthorization> {
  const apiKey = extractApiKey(request);
  if (!apiKey || !isDeveloperApiKeyFormat(apiKey)) {
    return {
      allowed: false,
      status: 401,
      error: "A valid GWAP API key is required.",
      keyId: null,
      ownerId: null,
      plan: null,
      usage: null,
    };
  }

  try {
    const redis = getWorkspaceRedis();
    const hash = hashDeveloperApiKey(apiKey);
    const record = await redis.get<DeveloperKeyRecord>(apiKeyStorageKey(hash));
    if (!record || record.status !== "active") {
      return {
        allowed: false,
        status: 401,
        error: "The API key is invalid or revoked.",
        keyId: null,
        ownerId: null,
        plan: null,
        usage: null,
      };
    }

    const account = await readAccount(record.ownerId);
    const summary = account.keys.find((key) => key.id === record.id);
    if (!summary || summary.status !== "active") {
      return {
        allowed: false,
        status: 401,
        error: "The API key is invalid or revoked.",
        keyId: null,
        ownerId: null,
        plan: null,
        usage: null,
      };
    }

    const plan = await resolveDeveloperPlan(record.ownerId);
    const limits = getDeveloperPlanLimits(plan);
    const minute = Math.floor(Date.now() / 60_000);
    const minuteKey = minuteStorageKey(record.id, minute);
    const minuteCount = await redis.incr(minuteKey);
    if (minuteCount === 1) await redis.expire(minuteKey, 62);
    if (minuteCount > limits.requestsPerMinute) {
      return {
        allowed: false,
        status: 429,
        error: "Per-minute API limit exceeded.",
        keyId: record.id,
        ownerId: record.ownerId,
        plan,
        usage: null,
      };
    }

    const window = getDeveloperUsageWindow();
    const usageKey = usageStorageKey(record.ownerId, window.id);
    const used = await redis.incr(usageKey);
    if (used === 1) await redis.expire(usageKey, window.ttlSeconds);
    const usage = {
      used,
      limit: limits.requestsPerMonth,
      remaining: Math.max(0, limits.requestsPerMonth - used),
      resetAt: window.reset.toISOString(),
    };

    if (used > limits.requestsPerMonth) {
      return {
        allowed: false,
        status: 429,
        error: "Monthly API quota exceeded.",
        keyId: record.id,
        ownerId: record.ownerId,
        plan,
        usage,
      };
    }

    const dailyKey = dailyUsageStorageKey(record.ownerId, utcDateId());
    const dailyCount = await redis.incr(dailyKey);
    if (dailyCount === 1) await redis.expire(dailyKey, DAILY_ANALYTICS_TTL_SECONDS);

    return {
      allowed: true,
      status: 200,
      error: null,
      keyId: record.id,
      ownerId: record.ownerId,
      plan,
      usage,
    };
  } catch {
    return {
      allowed: false,
      status: 503,
      error: "Developer API authorization is temporarily unavailable.",
      keyId: null,
      ownerId: null,
      plan: null,
      usage: null,
    };
  }
}
