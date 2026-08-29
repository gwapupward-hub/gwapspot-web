import assert from "node:assert/strict";
import { test } from "node:test";
import { getWalletAuthErrorMessage } from "./wallet-auth-error.ts";

test("reports disabled Solana login instead of asking the user to reconnect", () => {
  assert.equal(
    getWalletAuthErrorMessage({ code: "disallowed_login_method" }),
    "Solana wallet sign-in is temporarily unavailable. Use email or try again later.",
  );
  assert.equal(
    getWalletAuthErrorMessage(new Error("Login with solana wallet not allowed")),
    "Solana wallet sign-in is temporarily unavailable. Use email or try again later.",
  );
});

test("never points the wallet-only app client at the email path", () => {
  assert.equal(
    getWalletAuthErrorMessage({ code: "disallowed_login_method" }, "app"),
    "Solana wallet sign-in is temporarily unavailable. Try again in a moment.",
  );
});

test("explains app-domain and session bootstrap failures", () => {
  assert.equal(
    getWalletAuthErrorMessage(new Error("Origin not allowed")),
    "GWAP OS wallet sign-in is not enabled for this domain yet.",
  );
  assert.equal(
    getWalletAuthErrorMessage(
      new Error("Authenticated wallet session has no access token"),
    ),
    "Your wallet was verified, but the secure session was not created. Try signing in again.",
  );
});

test("keeps cancelled and unsupported signatures distinct", () => {
  assert.equal(
    getWalletAuthErrorMessage(new Error("User rejected the request")),
    "The signature request was cancelled. Nothing was changed.",
  );
  assert.equal(
    getWalletAuthErrorMessage(new Error("signMessage is not supported")),
    "This wallet cannot sign the ownership message required by GWAP OS.",
  );
  assert.equal(
    getWalletAuthErrorMessage(new Error("Network unavailable")),
    "We could not verify that wallet. Reconnect it and try again.",
  );
});
