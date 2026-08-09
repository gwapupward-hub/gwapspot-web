import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultGwapOsState, normalizeGwapOsState } from "./os-state.ts";

test("new workspaces enable the boot sequence by default", () => {
  assert.equal(createDefaultGwapOsState().settings.bootAnimation, true);
});

test("legacy workspace settings receive the boot default without losing preferences", () => {
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
});
