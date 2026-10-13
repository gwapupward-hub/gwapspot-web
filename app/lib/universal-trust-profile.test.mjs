import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loader = readFileSync(new URL("./universal-trust-profile.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../profile/[name]/page.tsx", import.meta.url), "utf8");
const lookup = readFileSync(new URL("../api/public/lookup/route.ts", import.meta.url), "utf8");

test("universal trust profile uses GNS as its identity source of truth", () => {
  assert.match(loader, /getGnsApiBase/);
  assert.match(loader, /normalizeGnsPublicProfile/);
  assert.match(loader, /\/profile\/\$\{encodeURIComponent\(normalized\)\}/);
  assert.match(loader, /cache: "no-store"/);
});

test("public profile explains trust through identity reputation and proof", () => {
  assert.match(page, /GWAP TRUST PROFILE/);
  assert.match(page, />IDENTITY</);
  assert.match(page, />REPUTATION</);
  assert.match(page, />PROOF</);
  assert.match(page, /PROOF, NOT CLAIMS/);
  assert.match(page, /PpvVerifiedActivity/);
  assert.match(page, /No score or badge guarantees future behavior/);
});

test("public lookup sends registered identities to the GWAP trust hub", () => {
  assert.match(lookup, /buildUniversalTrustProfilePath/);
  assert.match(lookup, /profileUrl: resolved\.found/);
  assert.match(lookup, /identity\.status === "found" && identity\.name/);
  assert.doesNotMatch(lookup, /getGnsProfileUrl/);
});
