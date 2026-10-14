import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboard = fs.readFileSync(
  path.join(process.cwd(), "app/app/components/dashboard-view.tsx"),
  "utf8",
);
const readiness = fs.readFileSync(
  path.join(process.cwd(), "app/app/components/trust-home-opportunity-readiness.tsx"),
  "utf8",
);
const policy = fs.readFileSync(
  path.join(process.cwd(), "app/lib/trust-home-opportunity-readiness.ts"),
  "utf8",
);

test("Trust Home surfaces private opportunity readiness from existing OS state", () => {
  assert.match(dashboard, /<TrustHomeOpportunityReadiness \/>/);
  assert.match(readiness, /state\.marketplaceIntents/);
  assert.match(readiness, /state\.ideaProjects/);
  assert.match(readiness, /getTrustHomeOpportunityReadiness/);
  assert.doesNotMatch(readiness, /fetch\s*\(/);
});

test("opportunity readiness never claims live publishing or matching", () => {
  assert.match(readiness, /Private briefs only/);
  assert.match(readiness, /publishing and matching are not live/);
  assert.match(readiness, /future Marketplace adapter/);
  assert.match(policy, /"Draft" \| "Ready"/);
  assert.doesNotMatch(policy, /Published|Matched|Funded|Escrow/);
});

test("private brief titles fail closed while workspace authority is unresolved", () => {
  assert.match(readiness, /migrationAvailable/);
  assert.match(readiness, /Private collaboration briefs are hidden/);
  assert.match(readiness, /Choose which workspace state is authoritative/);
});

test("trust context remains guidance rather than an eligibility decision", () => {
  assert.match(readiness, /Trust context/);
  assert.match(readiness, /Identity active/);
  assert.match(readiness, /Reputation active/);
  assert.match(readiness, /Profile strong/);
  assert.doesNotMatch(readiness, /eligible|approved|qualified/);
});

test("opportunity readiness adds no private-state analytics", () => {
  assert.doesNotMatch(readiness, /track\s*\(|safeTrack\s*\(/);
  assert.doesNotMatch(readiness, /wallet|email|transaction signature|receipt ID/i);
});
