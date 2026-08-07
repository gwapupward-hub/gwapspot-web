import "server-only";

import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

const STORAGE_NAMESPACE = "gwap:sprint5:v1";

let redisClient: Redis | null = null;

export function getWorkspaceRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Workspace storage is not configured");

  redisClient = new Redis({ url, token });
  return redisClient;
}

export function getPrivateStorageKey(scope: string, subject: string) {
  const digest = createHash("sha256").update(subject).digest("hex");
  return `${STORAGE_NAMESPACE}:${scope}:${digest}`;
}

export async function checkDistributedRateLimit(
  subject: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const key = getPrivateStorageKey("rate", `${subject}:${window}`);
  const redis = getWorkspaceRedis();
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, Math.max(2, Math.ceil(windowMs / 1_000) + 1));
  }

  const retryAfter = Math.max(
    1,
    Math.ceil(((window + 1) * windowMs - now) / 1_000),
  );

  return { allowed: count <= limit, retryAfter: count <= limit ? 0 : retryAfter };
}
