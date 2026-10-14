import assert from "node:assert/strict";
import test from "node:test";
import { getTrustHomeActiveWork } from "./trust-home-active-work.ts";

function project(id, title, status, updatedAt) {
  return { id, title, status, updatedAt };
}

test("active work excludes archived or malformed projects and sorts newest first", () => {
  const items = getTrustHomeActiveWork([
    project("project_11111111111111111111", "Older build", "building", "2026-10-13T20:00:00.000Z"),
    project("project_22222222222222222222", "Newest validation", "validating", "2026-10-13T22:00:00.000Z"),
    project("project_33333333333333333333", "Archived", "archived", "2026-10-13T23:00:00.000Z"),
    project("unsafe", "Bad id", "developing", "2026-10-13T23:30:00.000Z"),
    project("project_44444444444444444444", "Bad date", "developing", "not-a-date"),
  ]);

  assert.deepEqual(items.map((item) => item.title), ["Newest validation", "Older build"]);
  assert.equal(items[0].stageLabel, "Validating");
  assert.equal(items[1].stageLabel, "Building");
});

test("active work deep-links only validated project identifiers", () => {
  const [item] = getTrustHomeActiveWork([
    project("project_abcdef0123456789abcd", "Inventory helper", "developing", "2026-10-13T22:00:00.000Z"),
  ]);

  assert.equal(item.href, "/app/ideas/workspace/project_abcdef0123456789abcd");
  assert.equal(item.status, "developing");
  assert.match(item.note, /problem, customer, and plan/i);
});

test("active work is bounded to the Trust Home display limit", () => {
  const items = getTrustHomeActiveWork([
    project("project_00000000000000000001", "One", "developing", "2026-10-13T20:00:00.000Z"),
    project("project_00000000000000000002", "Two", "validating", "2026-10-13T21:00:00.000Z"),
    project("project_00000000000000000003", "Three", "building", "2026-10-13T22:00:00.000Z"),
    project("project_00000000000000000004", "Four", "launched", "2026-10-13T23:00:00.000Z"),
  ]);

  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.title), ["Four", "Three", "Two"]);
});

test("non-array workspace project data fails closed", () => {
  assert.deepEqual(getTrustHomeActiveWork(null), []);
  assert.deepEqual(getTrustHomeActiveWork({ items: [] }), []);
});
