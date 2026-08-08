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

test("keeps cancelled signatures distinct from verification failures", () => {
  assert.equal(
    getWalletAuthErrorMessage(new Error("User rejected the request")),
    "The signature request was cancelled. Nothing was changed.",
  );
  assert.equal(
    getWalletAuthErrorMessage(new Error("Network unavailable")),
    "We could not verify that wallet. Reconnect it and try again.",
  );
});
