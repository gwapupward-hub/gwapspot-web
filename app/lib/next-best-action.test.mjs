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
    },
  );

  assert.equal(
    getNextBestAction({
      ...base,
      signal: signal("completed", "identity", "identity_strengthened"),
    }).href,
    "/app/score",
  );
  assert.equal(
    getNextBestAction({
      ...base,
      signal: signal("completed", "reputation", "proof_of_control_verified"),
    }).href,
    "/app/ppv",
  );
  assert.equal(
    getNextBestAction({
      ...base,
      signal: signal("completed", "transaction", "verified_transaction_activity"),
    }).href,
    "/#overview",
  );
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

test("a new selected goal outranks a stale resume signal from another intent", () => {
  const action = getNextBestAction({
    ...base,
    entryIntent: "transaction",
    signal: signal("resumed", "build", "existing_project"),
  });
  assert.equal(action.mode, "intent");
  assert.equal(action.href, "/app/ppv");
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
