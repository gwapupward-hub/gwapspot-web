import assert from "node:assert/strict";
import test from "node:test";
import { getTrustHomeOpportunityReadiness } from "./trust-home-opportunity-readiness.ts";

function intent(id, projectId, role, status, updatedAt, projectTitle = undefined) {
  return { id, projectId, role, status, updatedAt, projectTitle };
}

function project(id, title) {
  return { id, title };
}

test("opportunity readiness summarizes only valid private brief state", () => {
  const summary = getTrustHomeOpportunityReadiness(
    [
      intent("brief_a", "project_a", "developer", "Draft", "2026-10-13T20:00:00.000Z"),
      intent("brief_b", "project_b", "designer", "Ready", "2026-10-13T22:00:00.000Z"),
      intent("brief_c", "project_c", "marketer", "Ready", "2026-10-13T21:00:00.000Z"),
      intent("unsafe/id", "project_a", "developer", "Ready", "2026-10-13T23:00:00.000Z"),
      intent("brief_bad_status", "project_a", "developer", "Published", "2026-10-13T23:00:00.000Z"),
    ],
    [
      project("project_a", "Inventory helper"),
      project("project_b", "Creator storefront"),
      project("project_c", "Research dashboard"),
    ],
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.ready, 2);
  assert.equal(summary.draft, 1);
  assert.deepEqual(summary.briefs.map((brief) => brief.id), ["brief_b", "brief_c"]);
  assert.equal(summary.briefs[0].projectTitle, "Creator storefront");
  assert.equal(summary.briefs[0].roleLabel, "Designer");
});

test("canonical project-title snapshots work without duplicating the project into legacy state", () => {
  const summary = getTrustHomeOpportunityReadiness(
    [intent("brief_a", "project_0123456789abcdefabcd", "developer", "Draft", "2026-10-13T20:00:00.000Z", "Canonical Idea Lab Project")],
    [],
  );

  assert.equal(summary.total, 1);
  assert.equal(summary.briefs[0].projectTitle, "Canonical Idea Lab Project");
});

test("brief status never becomes publishing or matching state", () => {
  const summary = getTrustHomeOpportunityReadiness(
    [intent("brief_a", "project_a", "researcher", "Ready", "2026-10-13T20:00:00.000Z")],
    [project("project_a", "Market research")],
  );

  assert.equal(summary.briefs[0].status, "Ready");
  assert.equal(summary.ready, 1);
  assert.equal(Object.hasOwn(summary.briefs[0], "published"), false);
  assert.equal(Object.hasOwn(summary.briefs[0], "matched"), false);
});

test("missing projects use a neutral title and malformed inputs fail closed", () => {
  const summary = getTrustHomeOpportunityReadiness(
    [
      intent("brief_a", "project_missing", "operations", "Draft", "2026-10-13T20:00:00.000Z"),
      intent("brief_bad_date", "project_missing", "operations", "Draft", "not-a-date"),
    ],
    null,
  );

  assert.equal(summary.total, 1);
  assert.equal(summary.briefs[0].projectTitle, "Project collaboration");
  assert.deepEqual(getTrustHomeOpportunityReadiness(null, null), {
    total: 0,
    ready: 0,
    draft: 0,
    briefs: [],
  });
});

test("brief display is bounded to the home limit", () => {
  const summary = getTrustHomeOpportunityReadiness(
    [
      intent("brief_1", "project_1", "developer", "Draft", "2026-10-13T20:00:00.000Z"),
      intent("brief_2", "project_2", "designer", "Draft", "2026-10-13T21:00:00.000Z"),
      intent("brief_3", "project_3", "marketer", "Ready", "2026-10-13T22:00:00.000Z"),
    ],
    [],
  );

  assert.equal(summary.briefs.length, 2);
  assert.deepEqual(summary.briefs.map((brief) => brief.id), ["brief_3", "brief_2"]);
});
