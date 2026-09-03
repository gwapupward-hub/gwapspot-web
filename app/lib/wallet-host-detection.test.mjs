import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRegisteredWallets,
  hasRequiredSignInFeatures,
  identifyKnownProvider,
  isSolanaCapableWallet,
} from "./wallet-host-detection.ts";

function fakeWallet({ name, chains, features }) {
  return { name, chains, features: Object.fromEntries(features.map((f) => [f, {}])) };
}

const phantom = fakeWallet({
  name: "Phantom",
  chains: ["solana:mainnet"],
  features: ["standard:connect", "standard:events", "solana:signMessage"],
});

const jupiter = fakeWallet({
  name: "Jupiter Mobile",
  chains: ["solana:mainnet", "solana:devnet"],
  features: ["standard:connect", "solana:signMessage", "solana:signTransaction"],
});

const evmOnlyWallet = fakeWallet({
  name: "MetaMask",
  chains: ["eip155:1"],
  features: ["standard:connect", "eip155:signMessage"],
});

const solanaWalletMissingSignMessage = fakeWallet({
  name: "PartialWallet",
  chains: ["solana:mainnet"],
  features: ["standard:connect", "solana:signTransaction"],
});

const solanaWalletMissingConnect = fakeWallet({
  name: "NoConnectWallet",
  chains: ["solana:mainnet"],
  features: ["solana:signMessage"],
});

test("isSolanaCapableWallet checks for a solana: chain, not just presence of any chain", () => {
  assert.equal(isSolanaCapableWallet(phantom), true);
  assert.equal(isSolanaCapableWallet(evmOnlyWallet), false);
});

test("hasRequiredSignInFeatures requires both standard:connect and solana:signMessage", () => {
  assert.equal(hasRequiredSignInFeatures(phantom), true);
  assert.equal(hasRequiredSignInFeatures(jupiter), true);
  assert.equal(hasRequiredSignInFeatures(solanaWalletMissingSignMessage), false);
  assert.equal(hasRequiredSignInFeatures(solanaWalletMissingConnect), false);
});

test("identifyKnownProvider recognizes Phantom and Jupiter by name, case-insensitively", () => {
  assert.equal(identifyKnownProvider("Phantom"), "phantom");
  assert.equal(identifyKnownProvider("phantom wallet"), "phantom");
  assert.equal(identifyKnownProvider("Jupiter Mobile"), "jupiter");
  assert.equal(identifyKnownProvider("Solflare"), "other");
});

test("classifies no registered wallets as missing", () => {
  assert.deepEqual(classifyRegisteredWallets([]), { status: "missing" });
});

test("classifies a non-Solana wallet as missing, not unsupported", () => {
  assert.deepEqual(classifyRegisteredWallets([evmOnlyWallet]), { status: "missing" });
});

test("classifies a Solana wallet that can sign in as ready, and identifies it", () => {
  const result = classifyRegisteredWallets([phantom]);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.wallets, [{ name: "Phantom", provider: "phantom" }]);
});

test("classifies multiple ready wallets and preserves provider identity for each", () => {
  const result = classifyRegisteredWallets([phantom, jupiter]);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.wallets, [
    { name: "Phantom", provider: "phantom" },
    { name: "Jupiter Mobile", provider: "jupiter" },
  ]);
});

test("classifies a Solana wallet that cannot sign in as unsupported, not missing", () => {
  const result = classifyRegisteredWallets([solanaWalletMissingSignMessage]);
  assert.equal(result.status, "unsupported");
  assert.deepEqual(result.wallets, [{ name: "PartialWallet", provider: "other" }]);
});

test("prefers ready over unsupported when both kinds of wallet are present", () => {
  const result = classifyRegisteredWallets([solanaWalletMissingSignMessage, phantom]);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.wallets, [{ name: "Phantom", provider: "phantom" }]);
});
