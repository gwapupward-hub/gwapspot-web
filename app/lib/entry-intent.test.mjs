import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAP_ENTRY_INTENTS,
  getGwapEntryIntentForPublicGoal,
  getGwapEntryIntentForPath,
  isGwapEntryIntent,
} from "./entry-intent.ts";

test("every audience entry path resolves to its canonical intent", () => {
  for (const [intent, config] of Object.entries(GWAP_ENTRY_INTENTS)) {
    assert.equal(getGwapEntryIntentForPath(config.sourcePath), intent);
  }
});

test("build and validate preserve public source paths while using focused first-value routes", () => {
  assert.equal(GWAP_ENTRY_INTENTS.build.sourcePath, "/app/ideas/lab");
  assert.equal(GWAP_ENTRY_INTENTS.build.actionHref, "/app/ideas/lab/start");
  assert.equal(GWAP_ENTRY_INTENTS.build.actionLabel, "Start my project");

  assert.equal(GWAP_ENTRY_INTENTS.validate.sourcePath, "/app/ideas");
  assert.equal(GWAP_ENTRY_INTENTS.validate.actionHref, "/app/ideas/validate");
  assert.equal(GWAP_ENTRY_INTENTS.validate.actionLabel, "Validate my idea");

  for (const intent of ["identity", "reputation", "transaction"]) {
    const config = GWAP_ENTRY_INTENTS[intent];
    assert.equal(config.actionHref, config.sourcePath);
  }
});

test("entry intent validation rejects unknown values", () => {
  assert.equal(isGwapEntryIntent("build"), true);
  assert.equal(isGwapEntryIntent("transaction"), true);
  assert.equal(isGwapEntryIntent("wallet"), false);
  assert.equal(isGwapEntryIntent(null), false);
  assert.equal(getGwapEntryIntentForPath("/app"), null);
});

test("all public goal cards retain their canonical intent, including in-page identity lookup", () => {
  const cards = {
    build_project: "build",
    validate_idea: "validate",
    identity: "identity",
    reputation: "reputation",
    proof: "transaction",
  };
  for (const [goal, intent] of Object.entries(cards)) {
    assert.equal(getGwapEntryIntentForPublicGoal(goal), intent);
  }
  assert.equal(getGwapEntryIntentForPublicGoal("unknown"), null);
  assert.equal(getGwapEntryIntentForPublicGoal(null), null);
});
