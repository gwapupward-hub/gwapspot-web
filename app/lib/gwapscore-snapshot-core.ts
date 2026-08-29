import { createHash } from "node:crypto";

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const SNAPSHOT_CADENCE_HOURS = 24;
export const MAX_SNAPSHOT_HISTORY = 180;
export const SNAPSHOT_TTL_SECONDS = 365 * 24 * 60 * 60;
export const ENGAGEMENT_WINDOW_HOURS = 168;

export const SNAPSHOT_METRICS = [
  "followers",
  "following",
  "lifetimePosts",
  "recentPosts",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "impressions",
] as const;

export type SnapshotMetric = (typeof SNAPSHOT_METRICS)[number];

export const SNAPSHOT_UNAVAILABLE_REASONS = [
  "not_authorized",
  "not_returned",
  "rate_limited",
  "source_error",
  "no_posts_in_window",
] as const;

export type SnapshotUnavailableReason = (typeof SNAPSHOT_UNAVAILABLE_REASONS)[number];

/**
 * A metric is either an observation GWAP actually made, or an explicit record
 * that GWAP could not see it. Unavailable is never coerced to 0: a later score
 * model must be able to tell "no reach" apart from "we could not read reach".
 */
export type MetricValue =
  | { state: "observed"; value: number }
  | { state: "unavailable"; reason: SnapshotUnavailableReason };

export type SnapshotCollectionStatus = "ok" | "partial" | "failed";

export type SnapshotWindow = {
  hours: number;
  postCount: number;
  oldestPostAt: string | null;
  newestPostAt: string | null;
};

export type SocialSnapshot = {
  snapshotId: string;
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  accountId: string;
  platform: "x";
  externalAccountId: string;
  socialHandle: string;
  collectedAt: string;
  scheduledFor: string;
  cadenceHours: number;
  source: { provider: "x-api-v2"; endpoints: string[] };
  provenance: {
    verificationMethod: "public-post";
    verifiedAt: string;
    challengeCode: string;
  };
  metrics: Record<SnapshotMetric, MetricValue>;
  window: SnapshotWindow | null;
  collection: { status: SnapshotCollectionStatus; diagnostic: string | null };
};

export type SnapshotMetricSeries = {
  metric: SnapshotMetric;
  points: Array<{ at: string; value: number }>;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  firstValue: number | null;
  latestValue: number | null;
  delta: number | null;
  unavailableCount: number;
};

export function observed(value: number): MetricValue {
  return { state: "observed", value: Math.max(0, Math.trunc(value)) };
}

export function unavailable(reason: SnapshotUnavailableReason): MetricValue {
  return { state: "unavailable", reason };
}

export function emptyMetrics(reason: SnapshotUnavailableReason): Record<SnapshotMetric, MetricValue> {
  return Object.fromEntries(
    SNAPSHOT_METRICS.map((metric) => [metric, unavailable(reason)]),
  ) as Record<SnapshotMetric, MetricValue>;
}

export function snapshotIdFor(accountId: string, platform: string, scheduledFor: string) {
  const digest = createHash("sha256")
    .update(`${accountId}:${platform}:${scheduledFor}`)
    .digest("hex")
    .slice(0, 24);
  return `snap_${digest}`;
}

export function nextSnapshotAt(after: Date, cadenceHours = SNAPSHOT_CADENCE_HOURS) {
  return new Date(after.getTime() + cadenceHours * 60 * 60 * 1_000).toISOString();
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function normalizeMetricValue(value: unknown): MetricValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metric = value as Partial<MetricValue>;
  if (metric.state === "observed") {
    const numeric = (metric as { value?: unknown }).value;
    return typeof numeric === "number" && Number.isFinite(numeric) && numeric >= 0
      ? { state: "observed", value: Math.trunc(numeric) }
      : null;
  }
  if (metric.state === "unavailable") {
    const reason = (metric as { reason?: unknown }).reason;
    return typeof reason === "string" &&
      (SNAPSHOT_UNAVAILABLE_REASONS as readonly string[]).includes(reason)
      ? { state: "unavailable", reason: reason as SnapshotUnavailableReason }
      : null;
  }
  return null;
}

function normalizeWindow(value: unknown): SnapshotWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const window = value as Partial<SnapshotWindow>;
  if (typeof window.hours !== "number" || !Number.isFinite(window.hours)) return null;
  if (typeof window.postCount !== "number" || !Number.isFinite(window.postCount)) return null;
  return {
    hours: window.hours,
    postCount: Math.max(0, Math.trunc(window.postCount)),
    oldestPostAt: isIsoTimestamp(window.oldestPostAt) ? window.oldestPostAt : null,
    newestPostAt: isIsoTimestamp(window.newestPostAt) ? window.newestPostAt : null,
  };
}

/**
 * Strict reader for stored snapshots. A row that does not match schema v1
 * exactly is dropped rather than repaired, so a future schema revision can
 * never be silently mixed into a v1 series.
 */
export function normalizeSnapshot(value: unknown): SocialSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<SocialSnapshot>;
  if (
    snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    typeof snapshot.snapshotId !== "string" ||
    !snapshot.snapshotId.startsWith("snap_") ||
    typeof snapshot.accountId !== "string" ||
    snapshot.platform !== "x" ||
    typeof snapshot.externalAccountId !== "string" ||
    typeof snapshot.socialHandle !== "string" ||
    !isIsoTimestamp(snapshot.collectedAt) ||
    !isIsoTimestamp(snapshot.scheduledFor) ||
    typeof snapshot.cadenceHours !== "number"
  ) {
    return null;
  }

  const provenance = snapshot.provenance;
  if (
    !provenance ||
    provenance.verificationMethod !== "public-post" ||
    !isIsoTimestamp(provenance.verifiedAt) ||
    typeof provenance.challengeCode !== "string"
  ) {
    return null;
  }

  const collection = snapshot.collection;
  if (!collection || !["ok", "partial", "failed"].includes(collection.status)) return null;

  const metrics = {} as Record<SnapshotMetric, MetricValue>;
  for (const metric of SNAPSHOT_METRICS) {
    const normalized = normalizeMetricValue(snapshot.metrics?.[metric]);
    if (!normalized) return null;
    metrics[metric] = normalized;
  }

  const source = snapshot.source;
  return {
    snapshotId: snapshot.snapshotId,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    accountId: snapshot.accountId,
    platform: "x",
    externalAccountId: snapshot.externalAccountId,
    socialHandle: snapshot.socialHandle,
    collectedAt: snapshot.collectedAt,
    scheduledFor: snapshot.scheduledFor,
    cadenceHours: snapshot.cadenceHours,
    source: {
      provider: "x-api-v2",
      endpoints: Array.isArray(source?.endpoints)
        ? source.endpoints.filter((endpoint): endpoint is string => typeof endpoint === "string")
        : [],
    },
    provenance: {
      verificationMethod: "public-post",
      verifiedAt: provenance.verifiedAt,
      challengeCode: provenance.challengeCode,
    },
    metrics,
    window: normalizeWindow(snapshot.window),
    collection: {
      status: collection.status,
      diagnostic: typeof collection.diagnostic === "string" ? collection.diagnostic : null,
    },
  };
}

export function normalizeSnapshotHistory(value: unknown): SocialSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSnapshot(entry))
    .filter((entry): entry is SocialSnapshot => Boolean(entry));
}

/**
 * Append-only: existing rows are never rewritten. A repeat of the same
 * snapshotId is ignored, and only the oldest tail is dropped at the cap.
 */
export function appendSnapshot(history: SocialSnapshot[], snapshot: SocialSnapshot) {
  if (history.some((entry) => entry.snapshotId === snapshot.snapshotId)) return history;
  return [snapshot, ...history].slice(0, MAX_SNAPSHOT_HISTORY);
}

export function deriveSnapshotSeries(history: SocialSnapshot[]): SnapshotMetricSeries[] {
  const ordered = [...history].sort(
    (left, right) => Date.parse(left.collectedAt) - Date.parse(right.collectedAt),
  );

  return SNAPSHOT_METRICS.map((metric) => {
    const points: Array<{ at: string; value: number }> = [];
    let unavailableCount = 0;

    for (const snapshot of ordered) {
      const value = snapshot.metrics[metric];
      if (value.state === "observed") {
        points.push({ at: snapshot.collectedAt, value: value.value });
      } else {
        unavailableCount += 1;
      }
    }

    const first = points.at(0) ?? null;
    const latest = points.at(-1) ?? null;
    return {
      metric,
      points,
      firstObservedAt: first?.at ?? null,
      lastObservedAt: latest?.at ?? null,
      firstValue: first?.value ?? null,
      latestValue: latest?.value ?? null,
      // A delta needs two real observations. One point, or none, yields null
      // rather than a difference measured against absent evidence.
      delta: first && latest && points.length > 1 ? latest.value - first.value : null,
      unavailableCount,
    };
  });
}
