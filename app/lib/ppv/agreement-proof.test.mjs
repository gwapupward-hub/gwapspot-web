import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(
  new URL("./agreement-proof.server.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../api/ppv/commerce/agreement-proof/prepare/route.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("../../app/ppv/agreements/agreement-actions.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../app/ppv/agreements/page.tsx", import.meta.url),
  "utf8",
);

test("bound agreement proof is derived from finalized Commerce state on the server", () => {
  assert.match(server, /readCommerceAgreement/);
  assert.match(server, /agreement\.partyA !== input\.authority/);
  assert.match(server, /agreement\.state !== "executed"/);
  assert.match(server, /contentHashHex: agreement\.termsHash/);
  assert.match(server, /new PublicKey\(agreement\.agreementAddress\)/);
  assert.match(server, /createHash\("sha256"\)/);
  assert.match(server, /agreementKey\.toBytes\(\)/);
  assert.match(server, /contextHashHex/);
  assert.match(server, /kind: "agreement"/);
});

test("bound agreement proof route derives authority from authenticated wallet", () => {
  assert.match(route, /getAuthenticatedWalletIdentityResult/);
  assert.match(route, /authority: identity\.verifiedWallet/);
  assert.doesNotMatch(route, /authority: payload\./);
  assert.match(route, /hasValidOrigin/);
  assert.match(route, /isGwapAppHostname/);
});

test("Commerce workbench verifies binding before opening the Core wallet request", () => {
  assert.match(client, /\/api\/ppv\/commerce\/agreement-proof\/prepare/);
  assert.match(client, /prepared\.binding\.agreementAddress !== agreementAddress/);
  assert.match(client, /prepared\.binding\.agreementIdHex !== record\.agreementId/);
  assert.match(client, /prepared\.binding\.agreementVersion !== record\.version/);
  assert.match(client, /prepared\.binding\.termsHashHex !== record\.termsHash/);
  assert.match(client, /prepared\.binding\.proofKind !== "agreement"/);
  assert.match(client, /\/api\/ppv\/core\/confirm/);
  assert.match(client, /Create bound Core proof/);
});

test("bound proof is Party A only and requires independent Core readiness", () => {
  assert.match(page, /coreMutationCapability=\{readiness\.actions\["proof\.create"\]\}/);
  assert.match(client, /const coreWritesReady = coreMutationCapability\.state === "ready"/);
  assert.match(client, /record\.partyA !== account\.verifiedWallet/);
  assert.match(client, /record\?\.state === "executed"/);
  assert.match(client, /Switch back to Party A/);
});

test("bound proof integration does not introduce Escrow or mainnet actions", () => {
  assert.doesNotMatch(server, /escrow/i);
  assert.doesNotMatch(route, /escrow/i);
  assert.doesNotMatch(server, /mainnet/i);
});
