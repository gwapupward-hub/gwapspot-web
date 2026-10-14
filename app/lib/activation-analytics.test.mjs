import assert from "node:assert/strict";
import test from "node:test";
import {
  activationElapsedBucket,
  chooseActivationProgress,
  createActivationProgress,
  isActivationStartPath,
  isAfterSelection,
  parseActivationSelection,
  parseActivationSignal,
  serializeActivationSelection,
  serializeActivationSignal,
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
  assert.equal(parseActivationSelection("build.9007199254740991"), null);
});

test("a newer cross-subdomain selection replaces stale completed app-origin progress", () => {
  const stale = {
    ...createActivationProgress("identity", "2026-10-13T21:00:00.000Z"),
    startedAt: "2026-10-13T21:01:00.000Z",
    completedAt: "2026-10-13T21:03:00.000Z",
  };
  const nextSelection = parseActivationSelection(
    serializeActivationSelection(
      createActivationProgress("build", "2026-10-13T22:00:00.000Z"),
    ),
  );
  const resolved = chooseActivationProgress(stale, nextSelection);
  assert.equal(resolved?.intent, "build");
  assert.equal(resolved?.selectedAt, "2026-10-13T22:00:00.000Z");
  assert.equal(resolved?.startedAt, null);
  assert.equal(resolved?.completedAt, null);
});

test("same activation keeps its app-origin progress", () => {
  const stored = {
    ...createActivationProgress("validate", "2026-10-13T22:00:00.000Z"),
    startedAt: "2026-10-13T22:01:00.000Z",
  };
  const selection = parseActivationSelection(serializeActivationSelection(stored));
  assert.equal(chooseActivationProgress(stored, selection), stored);
});

test("return-user activation signals are typed, intent-bound, and safe to parse", () => {
  const signal = {
    kind: "completed",
    intent: "reputation",
    milestone: "proof_of_control_verified",
    occurredAt: "2026-10-13T22:05:00.000Z",
  };
  const encoded = serializeActivationSignal(signal);
  assert.deepEqual(parseActivationSignal(encoded), signal);
  assert.equal(
    parseActivationSignal("completed.identity.proof_of_control_verified.1791930000000"),
    null,
  );
  assert.equal(parseActivationSignal("completed.build.wallet.1791930000000"), null);
  assert.equal(
    parseActivationSignal("completed.build.project_created.9007199254740991"),
    null,
  );
});

test("activation begins only on canonical intent surfaces", () => {
  assert.equal(isActivationStartPath("build", "/app/ideas/lab/start"), true);
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
