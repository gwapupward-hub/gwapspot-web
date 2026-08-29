import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SNAPSHOT_HISTORY,
  SNAPSHOT_CADENCE_HOURS,
  SNAPSHOT_METRICS,
  appendSnapshot,
  deriveSnapshotSeries,
  emptyMetrics,
  nextSnapshotAt,
  normalizeSnapshot,
  normalizeSnapshotHistory,
  observed,
  snapshotIdFor,
  unavailable,
} from "./gwapscore-snapshot-core.ts";

function snapshot(overrides = {}) {
  const { metrics, ...rest } = overrides;
  const collectedAt = overrides.collectedAt || "2026-08-01T04:00:00.000Z";
  return {
    snapshotId: overrides.snapshotId || snapshotIdFor("account", "x", collectedAt),
    schemaVersion: 1,
    accountId: "account",
    platform: "x",
    externalAccountId: "1234567890",
    socialHandle: "builder",
    collectedAt,
    scheduledFor: collectedAt,
    cadenceHours: SNAPSHOT_CADENCE_HOURS,
    source: { provider: "x-api-v2", endpoints: ["/2/users/:id"] },
    provenance: {
      verificationMethod: "public-post",
      verifiedAt: "2026-07-30T00:00:00.000Z",
      challengeCode: "GWAP-ABCD-EFGH",
    },
    window: null,
    collection: { status: "ok", diagnostic: null },
    ...rest,
    metrics: { ...emptyMetrics("not_returned"), ...(metrics || {}) },
  };
}

test("caps history at the retention limit and keeps the newest snapshots", () => {
  let history = [];
  for (let index = 0; index < MAX_SNAPSHOT_HISTORY + 20; index += 1) {
    const collectedAt = new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString();
    history = appendSnapshot(history, snapshot({ collectedAt }));
  }

  assert.equal(history.length, MAX_SNAPSHOT_HISTORY);
  assert.equal(history[0].collectedAt, "2026-07-19T00:00:00.000Z");
  assert.equal(history.at(-1).collectedAt, "2026-01-21T00:00:00.000Z");
});

test("appending the same snapshot id twice never duplicates a row", () => {
  const first = snapshot();
  const history = appendSnapshot(appendSnapshot([], first), { ...first, socialHandle: "renamed" });

  assert.equal(history.length, 1);
  assert.equal(history[0].socialHandle, "builder");
});

test("snapshot ids are stable per scheduled slot and distinct across slots", () => {
  assert.equal(
    snapshotIdFor("account", "x", "2026-08-01T04:00:00.000Z"),
    snapshotIdFor("account", "x", "2026-08-01T04:00:00.000Z"),
  );
  assert.notEqual(
    snapshotIdFor("account", "x", "2026-08-01T04:00:00.000Z"),
    snapshotIdFor("account", "x", "2026-08-02T04:00:00.000Z"),
  );
});

test("nextSnapshotAt advances exactly one cadence interval", () => {
  assert.equal(
    nextSnapshotAt(new Date("2026-08-01T04:00:00.000Z")),
    "2026-08-02T04:00:00.000Z",
  );
});

test("normalizeSnapshot rejects a foreign schema version", () => {
  assert.equal(normalizeSnapshot({ ...snapshot(), schemaVersion: 2 }), null);
  assert.equal(normalizeSnapshot({ ...snapshot(), schemaVersion: undefined }), null);
});

test("normalizeSnapshot rejects a malformed metric rather than repairing it", () => {
  const negative = snapshot({ metrics: { followers: { state: "observed", value: -4 } } });
  const unknownReason = snapshot({ metrics: { followers: { state: "unavailable", reason: "vibes" } } });
  const bareNumber = snapshot({ metrics: { followers: 42 } });

  assert.equal(normalizeSnapshot(negative), null);
  assert.equal(normalizeSnapshot(unknownReason), null);
  assert.equal(normalizeSnapshot(bareNumber), null);
});

test("normalizeSnapshot preserves every metric state and drops bad rows from history", () => {
  const valid = snapshot({
    metrics: { followers: observed(1200), impressions: unavailable("not_authorized") },
  });
  const normalized = normalizeSnapshot(valid);

  assert.ok(normalized);
  assert.deepEqual(normalized.metrics.followers, { state: "observed", value: 1200 });
  assert.deepEqual(normalized.metrics.impressions, { state: "unavailable", reason: "not_authorized" });
  assert.equal(Object.keys(normalized.metrics).length, SNAPSHOT_METRICS.length);
  assert.equal(normalizeSnapshotHistory([valid, { broken: true }, null]).length, 1);
});

test("series skip unavailable points instead of reading them as zero", () => {
  const history = [
    snapshot({ collectedAt: "2026-08-01T04:00:00.000Z", metrics: { followers: observed(100) } }),
    snapshot({ collectedAt: "2026-08-02T04:00:00.000Z", metrics: { followers: unavailable("rate_limited") } }),
    snapshot({ collectedAt: "2026-08-03T04:00:00.000Z", metrics: { followers: observed(140) } }),
  ];

  const followers = deriveSnapshotSeries(history).find((series) => series.metric === "followers");

  assert.equal(followers.points.length, 2);
  assert.equal(followers.unavailableCount, 1);
  assert.equal(followers.firstValue, 100);
  assert.equal(followers.latestValue, 140);
  assert.equal(followers.delta, 40);
  assert.ok(followers.points.every((point) => point.value !== 0));
});

test("a metric never observed reports no value and no delta", () => {
  const history = [
    snapshot({ collectedAt: "2026-08-01T04:00:00.000Z", metrics: { impressions: unavailable("not_authorized") } }),
    snapshot({ collectedAt: "2026-08-02T04:00:00.000Z", metrics: { impressions: unavailable("not_authorized") } }),
  ];

  const impressions = deriveSnapshotSeries(history).find((series) => series.metric === "impressions");

  assert.deepEqual(impressions.points, []);
  assert.equal(impressions.latestValue, null);
  assert.equal(impressions.delta, null);
  assert.equal(impressions.unavailableCount, 2);
});

test("a single observation yields a value but no delta", () => {
  const single = deriveSnapshotSeries([
    snapshot({ collectedAt: "2026-08-01T04:00:00.000Z", metrics: { followers: observed(100) } }),
  ]).find((series) => series.metric === "followers");

  assert.equal(single.latestValue, 100);
  assert.equal(single.delta, null);
});
