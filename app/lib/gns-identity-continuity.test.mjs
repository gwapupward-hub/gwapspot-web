import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const osServer = readFileSync(
  new URL("../app/lib/os-server.ts", import.meta.url),
  "utf8",
);
const gnsServer = readFileSync(
  new URL("../app/lib/gns.ts", import.meta.url),
  "utf8",
);
const identityView = readFileSync(
  new URL("../app/components/identity-wallet-view.tsx", import.meta.url),
  "utf8",
);
const registrationBridge = readFileSync(
  new URL("../app/components/gns-registration-sync-bridge.tsx", import.meta.url),
  "utf8",
);
const identityRoute = readFileSync(
  new URL("../api/gns/identity/route.ts", import.meta.url),
  "utf8",
);

test("cached .gwap state is fallback data, never ownership proof", () => {
  assert.match(osServer, /resolutionSource: "cache"/);
  assert.match(osServer, /verified: false/);
  assert.match(osServer, /identity\.resolutionSource !== "registry"/);
});

test("live GNS lookup is marked as the registry source of truth", () => {
  assert.match(gnsServer, /resolutionSource: "registry"/);
  assert.match(gnsServer, /resolutionSource: status === "none" \? "none" : "unavailable"/);
});

test("identity UI gates ownership claims and profile editing on live registry resolution", () => {
  assert.match(identityView, /gnsIdentity\.resolutionSource === "registry"/);
  assert.match(identityView, /Cached identity never counts as wallet ownership proof/);
  assert.match(identityView, /registryBacked && gnsIdentity\.name/);
});

test("successful registration reconciliation promotes the identity to registry-backed", () => {
  assert.match(registrationBridge, /resolutionSource: "registry"/);
});

test("a live no-domain result clears the GWAP account cache", () => {
  assert.match(
    identityRoute,
    /gnsIdentity\.status === "none" && account\.primaryGnsIdentity/,
  );
  assert.match(identityRoute, /updateGwapAccountGnsIdentity\(account\.id, null\)/);
});
