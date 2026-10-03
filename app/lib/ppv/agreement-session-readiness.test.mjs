import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(
  new URL("../../app/ppv/agreements/agreement-session-gate.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../app/ppv/agreements/page.tsx", import.meta.url),
  "utf8",
);
const indicator = readFileSync(
  new URL("../../app/components/ppv-commerce-inbox-indicator.tsx", import.meta.url),
  "utf8",
);

test("Agreement Workspace is gated on an authenticated signer session", () => {
  assert.match(gate, /authenticated, ready/);
  assert.match(gate, /!authenticated/);
  assert.match(gate, /!account\.verifiedWallet/);
  assert.match(gate, /wallets\.find/);
  assert.match(gate, /SESSION EXPIRED/);
  assert.match(gate, /WALLET SWITCHING/);
  assert.match(gate, /No PPV transaction was submitted/);
  assert.match(gate, /Sign in again/);
  assert.match(gate, /key=\{account\.verifiedWallet\}/);
});

test("Agreements page renders Commerce workspace through the session gate", () => {
  assert.match(page, /PpvAgreementSessionGate/);
  assert.match(page, /<PpvAgreementWorkspace/);
  assert.match(page, /<\/PpvAgreementSessionGate>/);
});

test("Commerce inbox does not poll while Privy auth is unresolved", () => {
  assert.match(indicator, /authenticated, getAccessToken, ready/);
  assert.match(indicator, /!ready/);
  assert.match(indicator, /!authenticated/);
  assert.match(indicator, /!account\.verifiedWallet/);
  assert.match(indicator, /if \(!token\)/);
  assert.match(indicator, /Authorization: `Bearer \$\{token\}`/);
});
