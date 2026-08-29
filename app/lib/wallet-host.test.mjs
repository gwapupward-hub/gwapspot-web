import assert from "node:assert/strict";
import test from "node:test";
import {
  identifyWalletHost,
  resolveWalletHost,
  userAgentWalletHint,
  walletHostLabel,
} from "./wallet-host.ts";

const signMessage = {
  "solana:signMessage": {},
  "standard:connect": {},
};

function standardWallet(name, features = signMessage) {
  return { name, chains: ["solana:mainnet"], features };
}

test("identifies the supported wallet hosts by name", () => {
  assert.equal(identifyWalletHost("Phantom"), "phantom");
  assert.equal(identifyWalletHost("Jupiter Wallet"), "jupiter");
  assert.equal(identifyWalletHost("Solflare"), "solflare");
  assert.equal(identifyWalletHost("Backpack"), "backpack");
  assert.equal(identifyWalletHost("Some Other Wallet"), "unknown");
  assert.equal(identifyWalletHost(""), "unknown");
  assert.equal(identifyWalletHost(null), "unknown");
});

test("labels unknown hosts without inventing a wallet name", () => {
  assert.equal(walletHostLabel("phantom"), "Phantom");
  assert.equal(walletHostLabel("unknown", "Nightly"), "Nightly");
  assert.equal(walletHostLabel("unknown", null), "Your wallet");
});

test("an ordinary browser with no provider evidence is not a wallet host", () => {
  const resolution = resolveWalletHost({
    standardWallets: [],
    injectedProviders: [],
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
  });

  assert.equal(resolution.status, "browser");
  assert.equal(resolution.primary, null);
  assert.deepEqual(resolution.candidates, []);
});

test("a user agent alone never opens the wallet gate", () => {
  // Secondary evidence: a UA that names Phantom, with nothing registered.
  assert.equal(userAgentWalletHint("Mozilla/5.0 Phantom/25.9.0"), "phantom");
  const resolution = resolveWalletHost({
    standardWallets: [],
    injectedProviders: [],
    userAgent: "Mozilla/5.0 Phantom/25.9.0",
  });

  assert.equal(resolution.status, "browser");
  assert.equal(resolution.primary, null);
});

test("a user agent may label an anonymous provider it did not create", () => {
  const resolution = resolveWalletHost({
    injectedProviders: [{ key: "solana", hasSignMessage: true, hasConnect: true }],
    userAgent: "Mozilla/5.0 JupiterWallet/1.4",
  });

  assert.equal(resolution.status, "wallet");
  assert.equal(resolution.primary?.id, "jupiter");
  assert.equal(resolution.primary?.label, "Jupiter");
});

test("a registered Wallet Standard wallet opens the gate", () => {
  const resolution = resolveWalletHost({
    standardWallets: [standardWallet("Phantom")],
  });

  assert.equal(resolution.status, "wallet");
  assert.equal(resolution.primary?.id, "phantom");
  assert.equal(resolution.primary?.source, "wallet-standard");
  assert.equal(resolution.primary?.canSignMessage, true);
  assert.equal(resolution.primary?.canConnect, true);
});

test("solana:signIn counts as ownership-proof capability", () => {
  const resolution = resolveWalletHost({
    standardWallets: [standardWallet("Phantom", { "solana:signIn": {} })],
  });

  assert.equal(resolution.primary?.canSignMessage, true);
  assert.equal(resolution.primary?.canConnect, false);
});

test("a non-Solana Wallet Standard wallet does not open the gate", () => {
  const resolution = resolveWalletHost({
    standardWallets: [
      {
        name: "An Ethereum Wallet",
        chains: ["eip155:1"],
        features: { "standard:connect": {} },
      },
    ],
  });

  assert.equal(resolution.status, "browser");
});

test("a Solana wallet is recognized from its feature namespace alone", () => {
  const resolution = resolveWalletHost({
    standardWallets: [
      { name: "Backpack", chains: [], features: { "solana:signMessage": {} } },
    ],
  });

  assert.equal(resolution.status, "wallet");
  assert.equal(resolution.primary?.id, "backpack");
});

test("a detected wallet that cannot sign stays a wallet host", () => {
  // §17: this must surface the signature failure state, not the browser gateway.
  const resolution = resolveWalletHost({
    standardWallets: [standardWallet("Solflare", { "standard:connect": {} })],
  });

  assert.equal(resolution.status, "wallet");
  assert.equal(resolution.primary?.canSignMessage, false);
  assert.equal(resolution.primary?.canConnect, true);
});

test("acceptance priority orders Phantom over Jupiter over the rest", () => {
  const resolution = resolveWalletHost({
    standardWallets: [
      standardWallet("Backpack"),
      standardWallet("Solflare"),
      standardWallet("Jupiter"),
      standardWallet("Phantom"),
      standardWallet("Nightly"),
    ],
  });

  assert.deepEqual(
    resolution.candidates.map((candidate) => candidate.id),
    ["phantom", "jupiter", "solflare", "backpack", "unknown"],
  );
  assert.equal(resolution.primary?.id, "phantom");
});

test("a signing host outranks a higher-priority host that cannot sign", () => {
  const resolution = resolveWalletHost({
    standardWallets: [standardWallet("Phantom", { "standard:connect": {} })],
    injectedProviders: [
      { key: "phantom.solana", isPhantom: true, hasSignMessage: true, hasConnect: true },
    ],
  });

  assert.equal(resolution.candidates.length, 1);
  assert.equal(resolution.primary?.canSignMessage, true);
  assert.equal(resolution.primary?.source, "injected");
});

test("one wallet seen twice is not counted twice", () => {
  const resolution = resolveWalletHost({
    standardWallets: [standardWallet("Phantom")],
    injectedProviders: [
      { key: "phantom.solana", isPhantom: true, hasSignMessage: true, hasConnect: true },
    ],
  });

  assert.equal(resolution.candidates.length, 1);
  assert.equal(resolution.primary?.source, "wallet-standard");
});

test("injected provider flags outrank a misleading global key", () => {
  const resolution = resolveWalletHost({
    injectedProviders: [
      { key: "solana", name: "Phantom", isJupiter: true, hasSignMessage: true },
    ],
  });

  assert.equal(resolution.primary?.id, "jupiter");
});

test("missing and malformed evidence resolves to an ordinary browser", () => {
  assert.equal(resolveWalletHost({}).status, "browser");
  assert.equal(
    resolveWalletHost({ standardWallets: null, injectedProviders: null }).status,
    "browser",
  );
  assert.equal(
    resolveWalletHost({ standardWallets: [null], injectedProviders: [null] }).status,
    "browser",
  );
});
