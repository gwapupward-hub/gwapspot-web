import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getWalletAuthErrorCode,
  getWalletAuthErrorMessage,
} from "./wallet-auth-error.ts";

test("reports disabled Solana login instead of asking the user to reconnect", () => {
  assert.match(
    getWalletAuthErrorMessage({ code: "disallowed_login_method" }),
    /not enabled in the Privy application/,
  );
  assert.equal(
    getWalletAuthErrorCode({ code: "disallowed_login_method" }),
    "disallowed_login_method",
  );
});

test("explains app-domain and session bootstrap failures", () => {
  assert.match(
    getWalletAuthErrorMessage(new Error("Origin not allowed")),
    /app\.gwapspot\.com/,
  );
  assert.equal(
    getWalletAuthErrorCode(new Error("Origin not allowed")),
    "origin_not_allowed",
  );
  assert.match(
    getWalletAuthErrorMessage(
      new Error("Authenticated wallet session has no access token"),
    ),
    /did not create the secure session/,
  );
  assert.equal(
    getWalletAuthErrorCode(
      new Error("Authenticated wallet session has no access token"),
    ),
    "session_token_missing",
  );
});

test("keeps cancelled and unsupported signatures distinct", () => {
  assert.equal(
    getWalletAuthErrorMessage(new Error("User rejected the request")),
    "The signature request was cancelled. Nothing was changed.",
  );
  assert.equal(
    getWalletAuthErrorCode(new Error("User rejected the request")),
    "signature_rejected",
  );
  assert.equal(
    getWalletAuthErrorMessage(new Error("signMessage is not supported")),
    "This wallet cannot sign the ownership message required by GWAP OS.",
  );
  assert.equal(
    getWalletAuthErrorCode(new Error("Network unavailable")),
    "wallet_login_failed",
  );
});

test("preserves safe Privy error codes for support references", () => {
  assert.equal(
    getWalletAuthErrorCode({ privyErrorCode: "invalid_origin" }),
    "invalid_origin",
  );
  assert.equal(
    getWalletAuthErrorCode({ code: "bad code with spaces!" }),
    "bad_code_with_spaces_",
  );
});
