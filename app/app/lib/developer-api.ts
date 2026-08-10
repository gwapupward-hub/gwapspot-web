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

const MAX_KEYS_PER_OWNER = 3;

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

export type DeveloperKeyView = DeveloperKeySummary & {
  usage: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  };
};

type DeveloperAccountRecord = {
  ownerId: string;
  keys: DeveloperKeySummary[];
};

export type DeveloperApiAuthorization = {
  allowed: boolean;
  status: 200 | 401 | 429 | 503;
  error: string | null;
  keyId: string | null;
  ownerId: string | null;
  plan: DeveloperPlan | null;
  usage: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  } | null;
};

function ownerStorageKey(ownerId: string) {
  return getPrivateStorageKey("developer-account", ownerId);
}

function apiKeyStorageKey(hash: string) {
  return getPrivateStorageKey("developer-key", hash);
}

function usageStorageKey(keyId: string, windowId: string) {
  return getPrivateStorageKey("developer-usage", `${keyId}:${windowId}`);
}

function minuteStorageKey(keyId: string, minute: number) {
  return getPrivateStorageKey("developer-minute", `${keyId}:${minute}`);
}

function sanitizeLabel(value: unknown) {
  if (typeof value !== "string") return "Default";
  const label = value.trim().replace(/\s+/g, " ").slice(0, 48);
  return label || "Default";
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

export async function listDeveloperApiKeys(ownerId: string): Promise<DeveloperKeyView[]> {
  const redis = getWorkspaceRedis();
  const account = await readAccount(ownerId);
  const window = getDeveloperUsageWindow();

  return Promise.all(
    account.keys.map(async (key) => {
      const rawUsed = await redis.get<number | string>(usageStorageKey(key.id, window.id));
      const usedValue = Number(rawUsed ?? 0);
      const used = Number.isFinite(usedValue) && usedValue > 0 ? Math.floor(usedValue) : 0;
      const limits = getDeveloperPlanLimits(key.plan);
      return {
        ...key,
        usage: {
          used,
          limit: limits.requestsPerMonth,
          remaining: Math.max(0, limits.requestsPerMonth - used),
          resetAt: window.reset.toISOString(),
        },
      };
    }),
  );
}

export async function createDeveloperApiKey(ownerId: string, label?: unknown) {
  const redis = getWorkspaceRedis();
  const account = await readAccount(ownerId);
  const activeCount = account.keys.filter((key) => key.status === "active").length;
  if (activeCount >= MAX_KEYS_PER_OWNER) throw new Error("API_KEY_LIMIT");

  const material = createDeveloperApiKeyMaterial();
  const record: DeveloperKeyRecord = {
    id: material.id,
    ownerId,
    label: sanitizeLabel(label),
    preview: material.preview,
    plan: "developer",
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

  await Promise.all([
    redis.set(apiKeyStorageKey(material.hash), record),
    redis.set(ownerStorageKey(ownerId), {
      ownerId,
      keys: [...account.keys, summary],
    } satisfies DeveloperAccountRecord),
  ]);

  return { apiKey: material.apiKey, key: summary };
}

export async function revokeDeveloperApiKey(ownerId: string, keyId: string) {
  const redis = getWorkspaceRedis();
  const account = await readAccount(ownerId);
  const target = account.keys.find((key) => key.id === keyId);
  if (!target || target.status !== "active") return false;

  const revokedAt = new Date().toISOString();
  const keys = account.keys.map((key) =>
    key.id === keyId ? { ...key, status: "revoked" as const, revokedAt } : key,
  );
  await redis.set(ownerStorageKey(ownerId), { ownerId, keys } satisfies DeveloperAccountRecord);
  return true;
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

    const limits = getDeveloperPlanLimits(record.plan);
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
        plan: record.plan,
        usage: null,
      };
    }

    const window = getDeveloperUsageWindow();
    const usageKey = usageStorageKey(record.id, window.id);
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
        plan: record.plan,
        usage,
      };
    }

    return {
      allowed: true,
      status: 200,
      error: null,
      keyId: record.id,
      ownerId: record.ownerId,
      plan: record.plan,
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
