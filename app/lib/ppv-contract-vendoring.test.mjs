import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const syncScript = readFileSync(
  new URL("../../scripts/sync-ppv-contracts.mjs", import.meta.url),
  "utf8",
);
const normalizeEscrow = readFileSync(
  new URL("./ppv-reputation/normalize-escrow.ts", import.meta.url),
  "utf8",
);

test("PPV vendoring includes the pure escrow dependencies used by reputation normalization", () => {
  for (const file of ["events.ts", "receipts.ts", "reader.ts", "states.ts"]) {
    assert.match(syncScript, new RegExp(file.replace(".", "\\.")));
    assert.doesNotThrow(() =>
      readFileSync(new URL(`./escrow/${file}`, import.meta.url), "utf8"),
    );
  }
});

test("vendored reputation modules use TypeScript relative specifiers", () => {
  assert.match(normalizeEscrow, /\.\.\/escrow\/receipts\.ts/);
  assert.match(normalizeEscrow, /\.\.\/escrow\/events\.ts/);
  assert.doesNotMatch(normalizeEscrow, /from "[.]{1,2}\/[^"]+\.js"/);
});

test("the sync script rewrites both sibling and parent relative imports", () => {
  assert.match(syncScript, /\.\{1,2\}/);
  assert.match(syncScript, /\.js/);
  assert.match(syncScript, /\.ts/);
});
