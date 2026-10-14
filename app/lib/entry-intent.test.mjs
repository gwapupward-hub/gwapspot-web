import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAP_ENTRY_INTENTS,
  getGwapEntryIntentForPath,
  isGwapEntryIntent,
} from "./entry-intent.ts";

test("every audience entry path resolves to its canonical intent", () => {
  for (const [intent, config] of Object.entries(GWAP_ENTRY_INTENTS)) {
    assert.equal(getGwapEntryIntentForPath(config.sourcePath), intent);
  }
});

test("build entry preserves the public source while starting in first-project flow", () => {
  assert.equal(GWAP_ENTRY_INTENTS.build.sourcePath, "/app/ideas/lab");
  assert.equal(GWAP_ENTRY_INTENTS.build.actionHref, "/app/ideas/lab/start");
  assert.equal(GWAP_ENTRY_INTENTS.build.actionLabel, "Start my project");

  for (const intent of ["validate", "identity", "reputation", "transaction"]) {
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
