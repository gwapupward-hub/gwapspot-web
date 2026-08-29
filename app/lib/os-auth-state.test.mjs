import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_OS_AUTH_STATE,
  OS_AUTH_SEQUENCE,
  canOpenGwapOs,
  isOsAuthInProgress,
  isSessionReady,
  nextOsAuthState,
  osAuthStateLabel,
} from "./os-auth-state.ts";

test("starts at SPLASH", () => {
  assert.equal(INITIAL_OS_AUTH_STATE, "SPLASH");
});

test("declares the required forward sequence in order", () => {
  assert.deepEqual(OS_AUTH_SEQUENCE, [
    "SPLASH",
    "READY_TO_ENTER",
    "DETECTING_WALLET",
    "AUTHORIZING_WALLET",
    "WAITING_FOR_SIGNATURE",
    "ESTABLISHING_SESSION",
    "OPENING_GWAP_OS",
    "READY",
  ]);
});

test("walks the full happy path in order", () => {
  let state = INITIAL_OS_AUTH_STATE;
  const steps = [
    ["ENTER_PRESSED", "READY_TO_ENTER"],
    ["AUTHORIZE_STARTED", "DETECTING_WALLET"],
    ["WALLET_DETECTED", "AUTHORIZING_WALLET"],
    ["SIGNATURE_REQUESTED", "WAITING_FOR_SIGNATURE"],
    ["SIGNATURE_APPROVED", "ESTABLISHING_SESSION"],
    ["SESSION_ESTABLISHED", "OPENING_GWAP_OS"],
    ["GWAP_OS_READY", "READY"],
  ];
  for (const [event, expected] of steps) {
    state = nextOsAuthState(state, event);
    assert.equal(state, expected, `${event} → ${expected}`);
  }
  assert.equal(isSessionReady(state), true);
});

test("rejected signature recovers cleanly to READY_TO_ENTER (no loop, no blank)", () => {
  const state = nextOsAuthState("WAITING_FOR_SIGNATURE", "SIGNATURE_REJECTED");
  assert.equal(state, "READY_TO_ENTER");
  // And rejection during authorization also recovers.
  assert.equal(
    nextOsAuthState("AUTHORIZING_WALLET", "SIGNATURE_REJECTED"),
    "READY_TO_ENTER",
  );
});

test("missing wallet returns to READY_TO_ENTER instead of stalling", () => {
  assert.equal(
    nextOsAuthState("DETECTING_WALLET", "WALLET_MISSING"),
    "READY_TO_ENTER",
  );
});

test("session failure recovers to READY_TO_ENTER", () => {
  assert.equal(
    nextOsAuthState("ESTABLISHING_SESSION", "SESSION_FAILED"),
    "READY_TO_ENTER",
  );
});

test("wallet change forces re-authentication from any state", () => {
  for (const from of OS_AUTH_SEQUENCE) {
    assert.equal(
      nextOsAuthState(from, "WALLET_CHANGED"),
      "DETECTING_WALLET",
      from,
    );
  }
});

test("session expiry invalidates the session from any state", () => {
  for (const from of OS_AUTH_SEQUENCE) {
    assert.equal(
      nextOsAuthState(from, "SESSION_EXPIRED"),
      "READY_TO_ENTER",
      from,
    );
  }
});

test("RESET returns to SPLASH from any state", () => {
  for (const from of OS_AUTH_SEQUENCE) {
    assert.equal(nextOsAuthState(from, "RESET"), "SPLASH", from);
  }
});

test("navigation into /app is gated on session readiness", () => {
  // Cannot open before the session is established.
  for (const state of [
    "SPLASH",
    "READY_TO_ENTER",
    "DETECTING_WALLET",
    "AUTHORIZING_WALLET",
    "WAITING_FOR_SIGNATURE",
    "ESTABLISHING_SESSION",
  ]) {
    assert.equal(canOpenGwapOs(state), false, state);
  }
  assert.equal(canOpenGwapOs("OPENING_GWAP_OS"), true);
  assert.equal(canOpenGwapOs("READY"), true);
});

test("invalid events leave the state unchanged (total machine)", () => {
  assert.equal(nextOsAuthState("READY_TO_ENTER", "SIGNATURE_APPROVED"), "READY_TO_ENTER");
  assert.equal(nextOsAuthState("SPLASH", "WALLET_DETECTED"), "SPLASH");
  assert.equal(nextOsAuthState("READY", "ENTER_PRESSED"), "READY");
});

test("reports in-progress states for progress UI", () => {
  assert.equal(isOsAuthInProgress("DETECTING_WALLET"), true);
  assert.equal(isOsAuthInProgress("WAITING_FOR_SIGNATURE"), true);
  assert.equal(isOsAuthInProgress("READY_TO_ENTER"), false);
  assert.equal(isOsAuthInProgress("READY"), false);
});

test("exposes a human label for every state", () => {
  for (const state of OS_AUTH_SEQUENCE) {
    assert.equal(typeof osAuthStateLabel(state), "string");
    assert.ok(osAuthStateLabel(state).length > 0, state);
  }
});
