import assert from "node:assert/strict";
import test from "node:test";
import {
  activationElapsedBucket,
  createActivationProgress,
  isActivationStartPath,
  isAfterSelection,
  parseActivationSelection,
  serializeActivationSelection,
} from "./activation-analytics.ts";

test("activation selection survives a cross-subdomain cookie round trip", () => {
  const selectedAt = "2026-10-13T22:00:00.000Z";
  const progress = createActivationProgress("validate", selectedAt);
  const encoded = serializeActivationSelection(progress);
  assert.deepEqual(parseActivationSelection(encoded), {
    intent: "validate",
    selectedAt,
  });
  assert.equal(parseActivationSelection("wallet.123"), null);
  assert.equal(parseActivationSelection("build.not-a-time"), null);
});

test("activation begins only on the canonical intent surface", () => {
  assert.equal(isActivationStartPath("build", "/app/ideas/lab"), true);
  assert.equal(isActivationStartPath("build", "/app"), false);
  assert.equal(isActivationStartPath("validate", "/app/ideas"), true);
  assert.equal(isActivationStartPath("identity", "/app/identity"), true);
  assert.equal(isActivationStartPath("identity", "/app/profile"), true);
  assert.equal(isActivationStartPath("reputation", "/app/score"), true);
  assert.equal(isActivationStartPath("transaction", "/app/ppv"), true);
  assert.equal(isActivationStartPath("transaction", "/app/ppv/activity"), true);
});

test("five-minute activation timing is bucketed without identity data", () => {
  const start = "2026-10-13T22:00:00.000Z";
  assert.equal(activationElapsedBucket(start, "2026-10-13T22:00:20.000Z"), "under_30s");
  assert.equal(activationElapsedBucket(start, "2026-10-13T22:01:00.000Z"), "30s_to_2m");
  assert.equal(activationElapsedBucket(start, "2026-10-13T22:03:00.000Z"), "2m_to_5m");
  assert.equal(activationElapsedBucket(start, "2026-10-13T22:06:00.000Z"), "5m_plus");
  assert.equal(isAfterSelection("2026-10-13T22:00:01.000Z", start), true);
  assert.equal(isAfterSelection("2026-10-13T21:59:59.000Z", start), false);
});
