import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultGwapOsState, normalizeGwapOsState } from "./os-state.ts";

test("new workspaces enable the boot sequence and general persona by default", () => {
  const state = createDefaultGwapOsState();
  assert.equal(state.settings.bootAnimation, true);
  assert.equal(state.settings.persona, "general");
});

test("legacy workspace settings receive new defaults without losing preferences", () => {
  const normalized = normalizeGwapOsState({
    settings: {
      compactMode: true,
      reduceMotion: true,
      productUpdates: false,
      communityUpdates: true,
    },
  });

  assert.equal(normalized.settings.compactMode, true);
  assert.equal(normalized.settings.reduceMotion, true);
  assert.equal(normalized.settings.bootAnimation, true);
  assert.equal(normalized.settings.productUpdates, false);
  assert.equal(normalized.settings.persona, "general");
});

test("supported personas persist and invalid values fail closed to general", () => {
  const creator = normalizeGwapOsState({ settings: { persona: "creator" } });
  const invalid = normalizeGwapOsState({ settings: { persona: "wizard" } });

  assert.equal(creator.settings.persona, "creator");
  assert.equal(invalid.settings.persona, "general");
});
