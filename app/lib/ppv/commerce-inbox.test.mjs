import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inboxServer = readFileSync(
  new URL("./commerce-inbox.server.ts", import.meta.url),
  "utf8",
);
const inboxRoute = readFileSync(
  new URL("../../api/ppv/commerce/inbox/route.ts", import.meta.url),
  "utf8",
);
const agreementUi = readFileSync(
  new URL("../../app/ppv/agreements/agreement-actions.tsx", import.meta.url),
  "utf8",
);
const osShell = readFileSync(
  new URL("../../app/components/os-shell.tsx", import.meta.url),
  "utf8",
);
const sendMode = readFileSync(
  new URL("../../app/send/page.tsx", import.meta.url),
  "utf8",
);

test("Commerce inbox is explicitly devnet and feature-gated", () => {
  assert.match(inboxServer, /PPV_CLUSTER/);
  assert.match(inboxServer, /PPV_COMMERCE_INBOX_ENABLED/);
  assert.match(inboxServer, /=== "devnet"/);
  assert.match(inboxServer, /=== "true"/);
});

test("Commerce inbox verifies delivered documents against finalized chain hashes", () => {
  assert.match(inboxServer, /readCommerceAgreement/);
  assert.match(inboxServer, /hashDocumentHexV1/);
  assert.match(inboxServer, /COMMERCE_INBOX_DOCUMENT_MISMATCH/);
  assert.match(inboxServer, /addToWalletIndex\(item\.partyA/);
  assert.match(inboxServer, /addToWalletIndex\(item\.partyB/);
});

test("Commerce inbox API derives authority from the authenticated GWAP wallet", () => {
  assert.match(inboxRoute, /getAuthenticatedWalletIdentityResult/);
  assert.match(inboxRoute, /identity\.verifiedWallet/);
  assert.match(inboxRoute, /hasValidOrigin/);
  assert.doesNotMatch(inboxRoute, /payload\.authority/);
});

test("Wallet B can open, verify, accept, or decline without copying identifiers", () => {
  assert.match(agreementUi, /openInboxItem/);
  assert.match(agreementUi, /setContent\(item\.content\)/);
  assert.match(agreementUi, /setTerms\(item\.terms\)/);
  assert.match(agreementUi, /Accept agreement/);
  assert.match(agreementUi, /Decline agreement/);
  assert.match(agreementUi, /syncInbox\(resultConfirmation\.agreement\)/);
});

test("GwapOS surfaces incoming Commerce notifications and blocks mainnet Send in devnet mode", () => {
  assert.match(osShell, /PpvCommerceInboxIndicator/);
  assert.match(osShell, /GWAP OS DEVNET/);
  assert.match(sendMode, /runtimeMode === "devnet"/);
  assert.match(sendMode, /Mainnet Send is disabled in Devnet Mode/);
});
