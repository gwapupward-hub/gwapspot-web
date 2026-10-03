import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../../app/ppv/agreements/agreement-workspace.tsx", import.meta.url),
  "utf8",
);
const canonical = readFileSync(
  new URL("../../lib/ppv-sdk/canonical.ts", import.meta.url),
  "utf8",
);

test("Agreement Workspace emits only PPV v1 canonical scalar types", () => {
  assert.match(canonical, /CanonicalScalar = string \| boolean/);
  assert.match(workspace, /schemaVersion: "1"/);
  assert.doesNotMatch(workspace, /schemaVersion:\s*1[,;]/);
  assert.match(workspace, /dueDate: form\.dueDate,/);
  assert.doesNotMatch(workspace, /dueDate: form\.dueDate \|\| null/);
  assert.match(workspace, /\? String\(parsedRevisions\)/);
  assert.match(workspace, /: "0",/);
});
