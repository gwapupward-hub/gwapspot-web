import { createHash } from "node:crypto";

type RateBucket = { count: number; resetAt: number };

const globalRateStore = globalThis as typeof globalThis & {
  gwapRateBuckets?: Map<string, RateBucket>;
};

const buckets = globalRateStore.gwapRateBuckets ?? new Map<string, RateBucket>();
globalRateStore.gwapRateBuckets = buckets;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;

  if (buckets.size > 5_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return { allowed: true, retryAfter: 0 };
}

export function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function auditAuthEvent(
  event: string,
  userId: string,
  outcome: "success" | "rejected" | "failed",
) {
  const actor = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  console.info("gwap_auth_audit", { event, actor, outcome });
}
