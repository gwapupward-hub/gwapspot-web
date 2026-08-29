import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWalletAuthConfig,
  offersEmailWalletCreation,
  walletLoginOrder,
} from "./wallet-auth-config.ts";

const connectors = { get: () => [] };

function appConfig(detectedHost = null) {
  return buildWalletAuthConfig({
    variant: "app",
    solanaConnectors: connectors,
    detectedHost,
  });
}

test("the app client never offers email wallet creation", () => {
  const config = appConfig();

  assert.deepEqual(config.loginMethods, ["wallet"]);
  assert.equal(config.embeddedWallets?.solana?.createOnLogin, "off");
  assert.equal(config.embeddedWallets?.ethereum?.createOnLogin, "off");
  assert.equal(offersEmailWalletCreation(config), false);
});

test("the public website keeps its email onboarding path", () => {
  const config = buildWalletAuthConfig({
    variant: "public",
    solanaConnectors: connectors,
  });

  assert.deepEqual(config.loginMethods, ["wallet", "email"]);
  assert.equal(
    config.embeddedWallets?.solana?.createOnLogin,
    "users-without-wallets",
  );
  assert.equal(offersEmailWalletCreation(config), true);
});

test("the detected host wallet leads the app client wallet list", () => {
  const config = appConfig({ id: "jupiter", label: "Jupiter" });

  assert.deepEqual(config.appearance?.walletList, [
    "jupiter",
    "phantom",
    "solflare",
    "backpack",
    "detected_solana_wallets",
  ]);
});

test("an undetected host falls back to acceptance priority order", () => {
  assert.deepEqual(appConfig().appearance?.walletList, [
    "phantom",
    "jupiter",
    "solflare",
    "backpack",
    "detected_solana_wallets",
  ]);
});

test("both clients stay Solana-only and keep other Wallet Standard hosts", () => {
  for (const variant of ["public", "app"]) {
    const config = buildWalletAuthConfig({
      variant,
      solanaConnectors: connectors,
    });
    assert.equal(config.appearance?.walletChainType, "solana-only");
    assert.ok(config.appearance?.walletList?.includes("detected_solana_wallets"));
    assert.equal(config.externalWallets?.solana?.connectors, connectors);
  }
});

test("the detected host leads the wallet login order", () => {
  assert.deepEqual(walletLoginOrder({ id: "jupiter" }), [
    "jupiter",
    "phantom",
    "solflare",
    "backpack",
  ]);
  assert.deepEqual(walletLoginOrder({ id: "unknown" }), [
    "phantom",
    "jupiter",
    "solflare",
    "backpack",
  ]);
  assert.deepEqual(walletLoginOrder(null), [
    "phantom",
    "jupiter",
    "solflare",
    "backpack",
  ]);
});
