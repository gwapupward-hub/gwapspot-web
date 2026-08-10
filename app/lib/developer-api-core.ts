import { createHash, randomBytes } from "node:crypto";

export const DEVELOPER_API_KEY_PREFIX = "gwap_live_";

export type DeveloperPlan = "developer" | "growth" | "scale";

export type DeveloperPlanLimits = {
  requestsPerMonth: number;
  requestsPerMinute: number;
};

const PLAN_LIMITS: Record<DeveloperPlan, DeveloperPlanLimits> = {
  developer: { requestsPerMonth: 1_000, requestsPerMinute: 60 },
  growth: { requestsPerMonth: 25_000, requestsPerMinute: 300 },
  scale: { requestsPerMonth: 250_000, requestsPerMinute: 1_000 },
};

export function getDeveloperPlanLimits(plan: DeveloperPlan) {
  return PLAN_LIMITS[plan];
}

export function hashDeveloperApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function createDeveloperApiKeyMaterial() {
  const secret = randomBytes(32).toString("base64url");
  const apiKey = `${DEVELOPER_API_KEY_PREFIX}${secret}`;
  const hash = hashDeveloperApiKey(apiKey);
  return {
    apiKey,
    hash,
    id: hash.slice(0, 16),
    preview: `${DEVELOPER_API_KEY_PREFIX}${secret.slice(0, 6)}…${secret.slice(-4)}`,
  };
}

export function isDeveloperApiKeyFormat(value: string) {
  if (!value.startsWith(DEVELOPER_API_KEY_PREFIX)) return false;
  const secret = value.slice(DEVELOPER_API_KEY_PREFIX.length);
  return /^[A-Za-z0-9_-]{40,64}$/.test(secret);
}

export function getDeveloperUsageWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const reset = new Date(Date.UTC(year, month + 1, 1));
  return {
    id: `${year}-${String(month + 1).padStart(2, "0")}`,
    start,
    reset,
    ttlSeconds: Math.max(60, Math.ceil((reset.getTime() - now.getTime()) / 1_000) + 172_800),
  };
}
