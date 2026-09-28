import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activityComponent = readFileSync(
  new URL("../components/ppv/ppv-verified-activity.tsx", import.meta.url),
  "utf8",
);
const identityView = readFileSync(
  new URL("../app/components/identity-wallet-view.tsx", import.meta.url),
  "utf8",
);
const reputationServer = readFileSync(
  new URL("./ppv-reputation-server.ts", import.meta.url),
  "utf8",
);

test("GwapOS binds Verified Activity to both wallet and live .gwap", () => {
  assert.match(identityView, /wallet=\{account\.verifiedWallet\}/);
  assert.match(identityView, /domain=\{gnsIdentity\.name\}/);
  assert.match(identityView, /registryBacked && gnsIdentity\.name/);
  assert.match(
    identityView,
    /Verified Activity stays hidden until GNS confirms this \.gwap/,
  );
});

test("Verified Activity fails closed on PPV environment or identity mismatch", () => {
  assert.match(activityComponent, /response\.headers\.get\("X-PPV-Cluster"\)/);
  assert.match(activityComponent, /cluster !== "devnet"/);
  assert.match(activityComponent, /resolvedWallet !== wallet/);
  assert.match(activityComponent, /resolvedDomain !== expectedDomain/);
  assert.match(activityComponent, /item\.holderWallet !== wallet/);
  assert.match(
    activityComponent,
    /item\.holderGnsRecord\.owner !== item\.holderWallet/,
  );
  assert.match(activityComponent, /item\.holderGnsRecord\?\.owner !== resolvedWallet/);
});

test("domain lookup uses event-time name receipts instead of wallet-wide history", () => {
  assert.match(reputationServer, /projection\.listNameReceipts\(name\)/);
  assert.match(reputationServer, /filterIdentityBoundReceipts/);
  assert.doesNotMatch(
    reputationServer,
    /lookup\.domain[\s\S]{0,1000}projection\.listWalletReceipts\(owner\)/,
  );
});
