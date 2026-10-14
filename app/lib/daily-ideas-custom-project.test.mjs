import assert from "node:assert/strict";
import test from "node:test";
import {
  customDailyIdeaProjectSummary,
  parseCustomDailyIdeaProjectInput,
} from "./daily-ideas-custom-project.ts";

test("direct project input requires a title and problem", () => {
  assert.deepEqual(
    parseCustomDailyIdeaProjectInput({
      title: "  Neighborhood inventory helper  ",
      problemDefinition: " Local shops lose sales because inventory is hard to track. ",
    }),
    {
      title: "Neighborhood inventory helper",
      problemDefinition: "Local shops lose sales because inventory is hard to track.",
    },
  );
  assert.equal(parseCustomDailyIdeaProjectInput({ title: "Only a title" }), null);
  assert.equal(parseCustomDailyIdeaProjectInput({ problemDefinition: "Only a problem" }), null);
  assert.equal(parseCustomDailyIdeaProjectInput([]), null);
});

test("direct project input is bounded before storage", () => {
  const parsed = parseCustomDailyIdeaProjectInput({
    title: "x".repeat(200),
    problemDefinition: "y".repeat(2000),
  });
  assert.equal(parsed?.title.length, 120);
  assert.equal(parsed?.problemDefinition.length, 1600);
  assert.equal(customDailyIdeaProjectSummary(parsed?.problemDefinition ?? "").length, 480);
});
