import assert from "node:assert/strict";
import test from "node:test";
import { getNextBestAction } from "./next-best-action.ts";

const base = {
  entryIntent: null,
  signal: null,
  identityStatus: "found",
  profileCompletion: 80,
  scoreStatus: "scored",
};

function signal(kind, intent, milestone) {
  return {
    kind,
    intent,
    milestone,
    occurredAt: "2026-10-13T22:05:00.000Z",
  };
}

test("completed milestones advance instead of repeating the completed step", () => {
  assert.deepEqual(
    getNextBestAction({
      ...base,
      signal: signal("completed", "build", "project_created"),
    }),
    {
      href: "/app/ideas/lab",
      title: "Validate what you just started",
      detail:
        "Your project exists. Pressure-test the problem, target customer, and assumptions before committing deeper build time.",
      label: "Start validation",
      mode: "advance",
      nextIntent: "validate",
    },
  );

  const validation = getNextBestAction({
    ...base,
    signal: signal("completed", "validate", "validation_started"),
  });
  assert.equal(validation.nextIntent, "build");
  assert.equal(validation.href, "/app/ideas/lab");

  const building = getNextBestAction({
    ...base,
    signal: signal("completed", "build", "build_started"),
  });
  assert.equal(building.nextIntent, "identity");
  assert.equal(building.href, "/app/identity");

  const identity = getNextBestAction({
    ...base,
    signal: signal("completed", "identity", "identity_strengthened"),
  });
  assert.equal(identity.href, "/app/score");
  assert.equal(identity.nextIntent, "reputation");

  const reputation = getNextBestAction({
    ...base,
    signal: signal("completed", "reputation", "proof_of_control_verified"),
  });
  assert.equal(reputation.href, "/app/ppv");
  assert.equal(reputation.nextIntent, "transaction");

  const transaction = getNextBestAction({
    ...base,
    signal: signal("completed", "transaction", "verified_transaction_activity"),
  });
  assert.equal(transaction.href, "/#overview");
  assert.equal(transaction.nextIntent, undefined);
});

test("existing progress resumes rather than creating duplicate work", () => {
  const project = getNextBestAction({
    ...base,
    entryIntent: "build",
    signal: signal("resumed", "build", "existing_project"),
  });
  assert.equal(project.mode, "resume");
  assert.equal(project.href, "/app/ideas/lab");
  assert.equal(project.label, "Resume project");

  const verification = getNextBestAction({
    ...base,
    entryIntent: "reputation",
    signal: signal("resumed", "reputation", "existing_social_verification"),
  });
  assert.equal(verification.mode, "resume");
  assert.equal(verification.href, "/app/score");
});

test("a new selected goal outranks stale signals from another intent", () => {
  for (const staleSignal of [
    signal("resumed", "build", "existing_project"),
    signal("completed", "build", "project_created"),
  ]) {
    const action = getNextBestAction({
      ...base,
      entryIntent: "transaction",
      signal: staleSignal,
    });
    assert.equal(action.mode, "intent");
    assert.equal(action.href, "/app/ppv");
  }
});

test("identity intent remains state-aware before completion", () => {
  const action = getNextBestAction({
    ...base,
    entryIntent: "identity",
    identityStatus: "found",
    profileCompletion: 40,
  });
  assert.equal(action.href, "/app/profile");
  assert.equal(action.label, "Complete profile");
});

test("no selected goal falls back to the trust foundation sequence", () => {
  assert.equal(
    getNextBestAction({
      ...base,
      identityStatus: "none",
      profileCompletion: 0,
      scoreStatus: "unscored",
    }).href,
    "/app/identity",
  );
  assert.equal(
    getNextBestAction({
      ...base,
      profileCompletion: 40,
      scoreStatus: "unscored",
    }).href,
    "/app/profile",
  );
  assert.equal(
    getNextBestAction({
      ...base,
      scoreStatus: "unscored",
    }).href,
    "/app/score",
  );
  assert.equal(getNextBestAction(base).href, "/app/ppv");
});
