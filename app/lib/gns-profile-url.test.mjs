import assert from "node:assert/strict";
import test from "node:test";
import { buildGnsPublicProfileUrl } from "./gns-profile-url.ts";

test("builds the live canonical GNS public profile route", () => {
  assert.equal(
    buildGnsPublicProfileUrl("Thagwap.GWAP"),
    "https://gwapspot.fun/name/thagwap",
  );
});

test("supports a configurable canonical path and rejects unsafe names", () => {
  assert.equal(
    buildGnsPublicProfileUrl("builder", {
      baseUrl: "https://profiles.example/",
      pathTemplate: "/{name}",
    }),
    "https://profiles.example/builder",
  );
  assert.equal(buildGnsPublicProfileUrl("../dashboard"), null);
  assert.equal(buildGnsPublicProfileUrl("unclaimed name"), null);
});
