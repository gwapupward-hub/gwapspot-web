import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWalletClientType,
  walletProviderLabel,
} from "./wallet-provider-label.ts";

test("formats a single-word client type", () => {
  assert.equal(formatWalletClientType("phantom"), "Phantom");
});

test("formats a multi-word, underscore-separated client type", () => {
  assert.equal(formatWalletClientType("coinbase_wallet"), "Coinbase Wallet");
});

test("formats a hyphen-separated client type", () => {
  assert.equal(formatWalletClientType("wallet-connect"), "Wallet Connect");
});

test("labels an embedded wallet as the GWAP Wallet regardless of client type", () => {
  assert.equal(
    walletProviderLabel({ connector_type: "embedded", wallet_client_type: "privy" }),
    "GWAP Wallet",
  );
});

test("labels an external wallet by its client type", () => {
  assert.equal(
    walletProviderLabel({ connector_type: "injected", wallet_client_type: "phantom" }),
    "Phantom",
  );
  assert.equal(
    walletProviderLabel({ connector_type: "wallet_connect", wallet_client_type: "solflare" }),
    "Solflare",
  );
});

test("falls back to a generic label when the client type is missing or unknown", () => {
  assert.equal(walletProviderLabel({ connector_type: "injected" }), "External wallet");
  assert.equal(
    walletProviderLabel({ connector_type: "injected", wallet_client_type: "unknown" }),
    "External wallet",
  );
});
