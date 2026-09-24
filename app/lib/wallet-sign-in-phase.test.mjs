import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_SIGN_IN_LABEL,
  canContinueAuthenticatedSession,
  resolveWalletSignInDisplay,
} from "./wallet-sign-in-phase.ts";

test("idle phase with the login modal closed displays idle", () => {
  assert.equal(resolveWalletSignInDisplay("idle", false), "idle");
});

test("idle phase with the login modal open displays connecting", () => {
  assert.equal(resolveWalletSignInDisplay("idle", true), "connecting");
});

test("establishing_session takes priority over modal state, open or closed", () => {
  assert.equal(resolveWalletSignInDisplay("establishing_session", true), "establishing_session");
  assert.equal(resolveWalletSignInDisplay("establishing_session", false), "establishing_session");
});

test("opening takes priority over modal state, open or closed", () => {
  assert.equal(resolveWalletSignInDisplay("opening", true), "opening");
  assert.equal(resolveWalletSignInDisplay("opening", false), "opening");
});

test("every display status has a label", () => {
  for (const status of ["idle", "connecting", "establishing_session", "opening"]) {
    assert.equal(typeof WALLET_SIGN_IN_LABEL[status], "string");
    assert.ok(WALLET_SIGN_IN_LABEL[status].length > 0);
  }
});

test("only the idle label reads as an actionable prompt rather than progress", () => {
  assert.equal(WALLET_SIGN_IN_LABEL.idle, "Connect Solana wallet");
  assert.notEqual(WALLET_SIGN_IN_LABEL.connecting, WALLET_SIGN_IN_LABEL.idle);
  assert.notEqual(WALLET_SIGN_IN_LABEL.establishing_session, WALLET_SIGN_IN_LABEL.idle);
  assert.notEqual(WALLET_SIGN_IN_LABEL.opening, WALLET_SIGN_IN_LABEL.idle);
});


test("email login waits for the embedded Solana wallet before opening GWAP OS", () => {
  assert.equal(
    canContinueAuthenticatedSession({
      ready: true,
      authenticated: true,
      hasSolanaWallet: false,
      sessionIssue: false,
      explicitLoginCompleted: true,
    }),
    false,
  );
  assert.equal(
    canContinueAuthenticatedSession({
      ready: true,
      authenticated: true,
      hasSolanaWallet: true,
      sessionIssue: false,
      explicitLoginCompleted: true,
    }),
    true,
  );
});

test("a prior session loop requires a fresh explicit wallet or email login", () => {
  assert.equal(
    canContinueAuthenticatedSession({
      ready: true,
      authenticated: true,
      hasSolanaWallet: true,
      sessionIssue: true,
      explicitLoginCompleted: false,
    }),
    false,
  );
  assert.equal(
    canContinueAuthenticatedSession({
      ready: true,
      authenticated: true,
      hasSolanaWallet: true,
      sessionIssue: true,
      explicitLoginCompleted: true,
    }),
    true,
  );
});
