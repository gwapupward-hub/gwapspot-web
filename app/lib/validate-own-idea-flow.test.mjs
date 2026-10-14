import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const entryIntent = fs.readFileSync(
  path.join(process.cwd(), "app/lib/entry-intent.ts"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/daily-ideas/workspace/route.ts"),
  "utf8",
);
const projects = fs.readFileSync(
  path.join(process.cwd(), "app/lib/daily-ideas-projects.ts"),
  "utf8",
);
const view = fs.readFileSync(
  path.join(process.cwd(), "app/app/ideas/validate/validate-own-idea.tsx"),
  "utf8",
);

test("validate intent uses a focused intake without changing its public source path", () => {
  assert.match(entryIntent, /actionHref: "\/app\/ideas\/validate"/);
  assert.match(entryIntent, /actionLabel: "Validate my idea"/);
  assert.match(entryIntent, /sourcePath: "\/app\/ideas"/);
});

test("validation intake writes only user-provided context into a developing project", () => {
  assert.match(route, /targetCustomer: body\.targetCustomer/);
  assert.match(route, /validationPlan: body\.validationPlan/);
  assert.match(projects, /status: "developing"/);
  assert.match(projects, /targetCustomer: parsed\.targetCustomer \?\? ""/);
  assert.match(projects, /validationPlan: parsed\.validationPlan \?\? \[\]/);
  assert.doesNotMatch(view, /action: "validate"/);
});

test("validation intake is resume-first and makes a different idea explicit", () => {
  assert.match(view, /project\.status === "developing" \|\| project\.status === "validating"/);
  assert.match(view, /Resume in Idea Lab/);
  assert.match(view, /Validate a different idea/);
  assert.match(view, /setShowForm\(true\)/);
});

test("validation intake captures target customer and a first real-world test", () => {
  assert.match(view, /targetCustomer: cleanCustomer/);
  assert.match(view, /validationPlan: \[cleanTest\]/);
  assert.match(view, /Prepare validation project/);
  assert.match(view, /Need inspiration\? Browse Daily Ideas/);
});

test("validation intake telemetry contains no project or identity data", () => {
  const tracking = view.match(/safeTrack\("project_created",\s*\{([\s\S]*?)\}\);/);
  assert.ok(tracking, "project_created telemetry must be present");
  assert.match(tracking[1], /source: "validation_intake"/);
  assert.doesNotMatch(tracking[1], /title|projectId|ideaId|wallet|email|targetCustomer|problemDefinition|validationPlan/i);
});
