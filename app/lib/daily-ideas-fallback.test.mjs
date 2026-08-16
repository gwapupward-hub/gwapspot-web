import assert from "node:assert/strict";
import test from "node:test";
import { selectFallbackDailyIdea } from "./daily-ideas-fallback.ts";

test("selects an unused category fallback without an AI provider", () => {
  const idea = selectFallbackDailyIdea("solana", new Set(), null);
  assert.ok(idea);
  assert.equal(idea.category, "solana");
  assert.match(idea.id, /^fallback-/);
  assert.equal(idea.status, "generated");
});

test("does not immediately redeliver a used fallback", () => {
  const first = selectFallbackDailyIdea("general", new Set(), null);
  assert.ok(first);
  const second = selectFallbackDailyIdea("general", new Set([first.id]), null);
  assert.ok(second);
  assert.notEqual(second.id, first.id);
});

test("can fall back to general inventory for an exhausted category", () => {
  const solana = selectFallbackDailyIdea("solana", new Set(), null);
  assert.ok(solana);
  const next = selectFallbackDailyIdea("solana", new Set([solana.id]), null);
  assert.ok(next);
  assert.equal(next.category, "general");
});
