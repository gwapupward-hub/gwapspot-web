import assert from "node:assert/strict";
import test from "node:test";
import {
  findLinkedSolanaAddress,
  shortenWalletAddress,
} from "./wallet-identity.ts";

test("shortens a Solana address for the wallet surface", () => {
  assert.equal(
    shortenWalletAddress("7xF3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa9ab2"),
    "7xF3…9ab2",
  );
});

test("leaves short and missing addresses alone", () => {
  assert.equal(shortenWalletAddress("7xF3"), "7xF3");
  assert.equal(shortenWalletAddress(""), "");
  assert.equal(shortenWalletAddress(null), "");
  assert.equal(shortenWalletAddress(undefined), "");
});

test("finds the linked Solana wallet address", () => {
  assert.equal(
    findLinkedSolanaAddress([
      { type: "email", address: "person@example.com" },
      { type: "wallet", chainType: "ethereum", address: "0xabc" },
      { type: "wallet", chainType: "solana", address: "7xF3" },
    ]),
    "7xF3",
  );
});

test("reports no address when no Solana wallet is linked", () => {
  assert.equal(findLinkedSolanaAddress([]), null);
  assert.equal(findLinkedSolanaAddress(null), null);
  assert.equal(
    findLinkedSolanaAddress([{ type: "wallet", chainType: "solana", address: "" }]),
    null,
  );
});
