import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const generatorSource = await readFile(new URL("./daily-ideas-generator.ts", import.meta.url), "utf8");
const routeSource = await readFile(
  new URL("../api/v1/daily-ideas/telegram/ideas/next/route.ts", import.meta.url),
  "utf8",
);

test("provider diagnostics log status/code without raw response bodies", () => {
  assert.match(generatorSource, /providerStatus/);
  assert.match(generatorSource, /providerCode/);
  assert.match(generatorSource, /response\.clone\(\)\.json\(\)/);
  assert.match(generatorSource, /Never log or surface raw provider response bodies/);
  assert.match(routeSource, /providerStatus: providerError\?\.providerStatus/);
  assert.match(routeSource, /providerCode: providerError\?\.providerCode/);
  assert.doesNotMatch(routeSource, /error\.message/);
});
