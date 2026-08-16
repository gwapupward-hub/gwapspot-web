import assert from "node:assert/strict";
import test from "node:test";
import { dailyIdeaCategories } from "./daily-ideas-core.ts";

test("launch categories remain unique and include general", () => {
  assert.equal(new Set(dailyIdeaCategories).size, dailyIdeaCategories.length);
  assert.ok(dailyIdeaCategories.includes("general"));
  assert.ok(dailyIdeaCategories.includes("gwap-ecosystem"));
});

test("preference category ceiling is compatible with multi-select launch UI", () => {
  assert.ok(dailyIdeaCategories.length >= 8);
});
