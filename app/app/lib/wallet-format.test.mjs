import assert from "node:assert/strict";
import test from "node:test";
import { shortenWalletAddress } from "./wallet-format.ts";

test("shortens a long address to lead…tail form", () => {
  assert.equal(
    shortenWalletAddress("GwapSpotWa11etAddress1234567890Example"),
    "Gwap…mple",
  );
});

test("honors custom lead/tail lengths", () => {
  assert.equal(
    shortenWalletAddress("GwapSpotWa11etAddress1234567890Example", 5, 5),
    "GwapS…ample",
  );
});

test("returns short values and empties unchanged", () => {
  assert.equal(shortenWalletAddress("abcd"), "abcd");
  assert.equal(shortenWalletAddress(""), "");
  assert.equal(shortenWalletAddress(null), "");
  assert.equal(shortenWalletAddress(undefined), "");
});

test("trims surrounding whitespace before formatting", () => {
  assert.equal(
    shortenWalletAddress("  GwapSpotWa11etAddress1234567890Example  "),
    "Gwap…mple",
  );
});
