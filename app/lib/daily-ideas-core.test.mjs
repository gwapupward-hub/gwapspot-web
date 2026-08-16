import assert from "node:assert/strict";
import test from "node:test";
import {
  dailyIdeaSimilarity,
  isDuplicateDailyIdea,
  parseDailyIdeaCategory,
  parseGeneratedDailyIdea,
  selectReusableDailyIdea,
} from "./daily-ideas-core.ts";

const payload = {
  title: "AI Reputation Agent for Solana",
  summary: "Explain wallet behavior before another user interacts with it.",
  problem: "Wallet histories are difficult to interpret quickly.",
  solution: "Analyze transactions and return a concise behavioral risk summary.",
  targetAudience: ["Solana traders", "marketplaces"],
  whyNow: "Agent commerce makes counterparty context more important.",
  category: "solana",
  tags: ["Solana", "AI", "SaaS"],
  monetization: ["API subscriptions"],
  mvpFeatures: ["Wallet input", "Risk summary"],
  difficulty: "Intermediate",
  estimatedStartupCost: "Low",
  estimatedBuildScope: "Weekend prototype",
  opportunityScore: 8.7,
  risks: ["False positives"],
  validationSteps: ["Interview five marketplace operators"],
  firstAction: "Draft the risk-signal rubric.",
};

function idea(overrides = {}) {
  return parseGeneratedDailyIdea(
    { ...payload, ...overrides },
    { id: crypto.randomUUID(), requestedCategory: "general", generatedAt: "2026-08-16T00:00:00.000Z" },
  );
}

test("normalizes the full structured idea contract", () => {
  const parsed = idea();
  assert.ok(parsed);
  assert.equal(parsed.category, "solana");
  assert.equal(parsed.opportunityScore, 8.7);
  assert.deepEqual(parsed.targetAudience, ["Solana traders", "marketplaces"]);
  assert.equal(parsed.opportunity, parsed.whyNow);
  assert.equal(parsed.status, "generated");
});

test("rejects incomplete or out-of-range AI output", () => {
  assert.equal(idea({ solution: "" }), null);
  assert.equal(idea({ opportunityScore: 11 }), null);
  assert.equal(idea({ tags: [] }), null);
  assert.equal(idea({ validationSteps: [] }), null);
});

test("supports the launch category aliases", () => {
  assert.equal(parseDailyIdeaCategory("AI & Agents"), "ai");
  assert.equal(parseDailyIdeaCategory("ai-agents"), "ai");
  assert.equal(parseDailyIdeaCategory("creator"), "creator-economy");
  assert.equal(parseDailyIdeaCategory("anything"), "general");
});

test("detects substantially similar ideas and selects unused inventory", () => {
  const original = idea();
  const duplicate = idea({ title: "Solana AI Reputation Agent" });
  const different = idea({
    title: "Local Restaurant Shift Planner",
    summary: "Forecast staffing needs for independent restaurants.",
    problem: "Managers overstaff quiet shifts and understaff demand spikes.",
    solution: "Recommend weekly staffing levels from reservations and prior sales.",
    category: "local-business",
    tags: ["restaurants", "operations"],
  });
  assert.ok(original && duplicate && different);
  assert.ok(dailyIdeaSimilarity(original, duplicate) > dailyIdeaSimilarity(original, different));
  assert.equal(isDuplicateDailyIdea(duplicate, [original]), true);
  assert.equal(selectReusableDailyIdea([original, different], new Set([original.id]))?.id, different.id);
});
