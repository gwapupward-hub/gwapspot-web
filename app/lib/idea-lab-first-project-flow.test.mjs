import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/daily-ideas/workspace/route.ts"),
  "utf8",
);
const projects = fs.readFileSync(
  path.join(process.cwd(), "app/lib/daily-ideas-projects.ts"),
  "utf8",
);
const startView = fs.readFileSync(
  path.join(process.cwd(), "app/app/ideas/lab/start/first-project-start.tsx"),
  "utf8",
);

test("direct project creation stays inside the canonical Daily Ideas workspace", () => {
  assert.match(route, /body\.action === "create-project"/);
  assert.match(route, /startCustomDailyIdeaProject\(subject/);
  assert.match(route, /daily-ideas\.project-create/);
  assert.match(projects, /getPrivateStorageKey\("daily-ideas-projects", subject\)/);
  assert.match(projects, /status: "developing"/);
  assert.match(projects, /category: "general"/);
});

test("build-first direct projects keep unanswered work blank by default", () => {
  assert.match(projects, /targetCustomer: parsed\.targetCustomer \?\? ""/);
  assert.match(projects, /validationPlan: parsed\.validationPlan \?\? \[\]/);
  for (const emptyField of [
    "marketHypothesis",
    "businessModel",
    "technicalArchitecture",
    "estimatedCost",
    "goToMarket",
    "firstAction",
  ]) {
    assert.match(projects, new RegExp(`${emptyField}: ""`));
  }
  for (const emptyList of ["mvpFeatures", "buildRoadmap", "risks"]) {
    assert.match(projects, new RegExp(`${emptyList}: \\[\\]`));
  }
  assert.doesNotMatch(startView, /targetCustomer|validationPlan/);
});

test("first-project UI resumes existing work and tracks no project identity", () => {
  assert.match(startView, /projects\?\.total/);
  assert.match(startView, /router\.replace\("\/app\/ideas\/lab"\)/);
  assert.match(startView, /action: "create-project"/);
  assert.match(startView, /source: "idea_lab_direct"/);
  const tracking = startView.match(/safeTrack\("project_created",\s*\{([\s\S]*?)\}\);/);
  assert.ok(tracking, "project_created telemetry must be present");
  assert.doesNotMatch(tracking[1], /title|projectId|ideaId|wallet|email|name\s*:/i);
});
