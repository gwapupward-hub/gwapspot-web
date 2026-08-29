import assert from "node:assert/strict";
import test from "node:test";
import { walletSessionAction } from "./wallet-session.ts";

const sessionWallet = "7xF3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa9ab2";

test("keeps the session while the host wallet still matches", () => {
  assert.equal(
    walletSessionAction({ sessionWallet, hostWallet: sessionWallet }),
    "keep",
  );
});

test("reauthenticates when the host wallet switches accounts", () => {
  assert.equal(
    walletSessionAction({ sessionWallet, hostWallet: "9zZ9differentAddress0001" }),
    "reauthenticate",
  );
});

test("treats a disconnected or locked host wallet as no change", () => {
  for (const hostWallet of [null, undefined, "", "   "]) {
    assert.equal(walletSessionAction({ sessionWallet, hostWallet }), "keep");
  }
});

test("does nothing without a session wallet to compare against", () => {
  assert.equal(
    walletSessionAction({ sessionWallet: null, hostWallet: sessionWallet }),
    "keep",
  );
});

test("compares base58 addresses case-sensitively", () => {
  assert.equal(
    walletSessionAction({
      sessionWallet,
      hostWallet: sessionWallet.toLowerCase(),
    }),
    "reauthenticate",
  );
});
