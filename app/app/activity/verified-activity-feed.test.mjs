import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(
  path.join(process.cwd(), "app/app/activity/page.tsx"),
  "utf8",
);

test("activity page separates verified evidence from private progress", () => {
  assert.match(page, /Verified Evidence/);
  assert.match(page, /Private Progress/);
  assert.match(page, /PpvVerifiedActivity/);
  assert.match(page, /Verified evidence feed/);
  assert.match(page, /not presented as\s+reputation evidence/);
});

test("routine OS activity is not framed as verified trust evidence", () => {
  assert.doesNotMatch(page, /Your GwapOS timeline/);
  assert.match(page, /Device-cached confirmation/);
  assert.match(page, /resume context/);
  assert.match(page, /routine product activity cannot masquerade as reputation/);
});
