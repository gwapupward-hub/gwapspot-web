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

test("validation context is optional, normalized, and bounded before storage", () => {
  const parsed = parseCustomDailyIdeaProjectInput({
    title: "x".repeat(200),
    problemDefinition: "y".repeat(2000),
    targetCustomer: `  ${"z".repeat(1000)}  `,
    validationPlan: [
      `  ${"a".repeat(700)}  `,
      "   ",
      42,
    ],
  });
  assert.equal(parsed?.title.length, 120);
  assert.equal(parsed?.problemDefinition.length, 1600);
  assert.equal(parsed?.targetCustomer?.length, 900);
  assert.deepEqual(parsed?.validationPlan?.map((item) => item.length), [600]);
  assert.equal(customDailyIdeaProjectSummary(parsed?.problemDefinition ?? "").length, 480);
});

test("malformed optional validation context fails closed", () => {
  assert.equal(
    parseCustomDailyIdeaProjectInput({
      title: "Valid title",
      problemDefinition: "Valid problem",
      targetCustomer: { unsafe: true },
    }),
    null,
  );
  assert.equal(
    parseCustomDailyIdeaProjectInput({
      title: "Valid title",
      problemDefinition: "Valid problem",
      validationPlan: "not-a-list",
    }),
    null,
  );
});
