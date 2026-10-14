import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboard = fs.readFileSync(
  path.join(process.cwd(), "app/app/components/dashboard-view.tsx"),
  "utf8",
);
const activeWork = fs.readFileSync(
  path.join(process.cwd(), "app/app/components/trust-home-active-work.tsx"),
  "utf8",
);
const policy = fs.readFileSync(
  path.join(process.cwd(), "app/lib/trust-home-active-work.ts"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(process.cwd(), "app/app/page.tsx"),
  "utf8",
);

test("Trust Home Active Work is backed by the canonical Daily Ideas workspace", () => {
  assert.match(dashboard, /<TrustHomeActiveWork key=\{account\.verifiedWallet\} \/>/);
  assert.match(activeWork, /\/api\/daily-ideas\/workspace/);
  assert.match(activeWork, /getTrustHomeActiveWork\(payload\.projects\?\.items\)/);
  assert.doesNotMatch(dashboard, /recentProducts|state\.recent/);
});

test("Active Work links to exact project workspaces and excludes archived state", () => {
  assert.match(policy, /\/app\/ideas\/workspace\/\$\{id\}/);
  assert.match(policy, /developing/);
  assert.match(policy, /validating/);
  assert.match(policy, /building/);
  assert.match(policy, /launched/);
  assert.doesNotMatch(policy, /"archived",/);
});

test("Active Work fails softly without fabricating project state", () => {
  assert.match(activeWork, /Active work is temporarily unavailable/);
  assert.match(activeWork, /Open Idea Lab directly/);
  assert.match(activeWork, /Start your first project/);
  assert.doesNotMatch(activeWork, /track\(|safeTrack\(|projectId\s*:/);
});

test("Trust Home no longer depends on ecosystem product recency", () => {
  assert.doesNotMatch(page, /ecosystemProducts/);
  assert.doesNotMatch(page, /products=/);
  assert.doesNotMatch(dashboard, /EcosystemProduct/);
  assert.match(dashboard, /Active Work/);
  assert.match(dashboard, /What you are actually building/);
});
