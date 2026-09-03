// Phase 7 aggregate regression guards. These source-level invariants fail loudly
// if a future change reintroduces a second auth owner, drops the duplicate-callback
// guard, leaks the full app to ordinary browsers, or exposes email onboarding on
// the app domain.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("wallet sign-in keeps a single duplicate-callback guard", () => {
  const wallet = read("../components/wallet-sign-in.tsx");
  assert.match(wallet, /navigationStarted\.current/);
  assert.match(wallet, /if \(navigationStarted\.current\) return/);
  // Navigation waits for the access token before opening /app.
  assert.match(wallet, /waitForAccessToken/);
  assert.match(wallet, /window\.location\.replace\(redirectPath\)/);
});

test("Privy remains the single authentication owner", () => {
  const wallet = read("../components/wallet-sign-in.tsx");
  const provider = read("../components/wallet-auth-provider.tsx");
  // No competing connect/SIWS entry points.
  assert.doesNotMatch(wallet, /useLoginWithSiws/);
  assert.doesNotMatch(wallet, /useConnectWallet/);
  assert.doesNotMatch(wallet, /useWalletModal/);
  // A @solana/wallet-adapter-react stack (ConnectionProvider / WalletProvider
  // / WalletModalProvider) used to be mounted alongside Privy - it never
  // connected to anything and must not come back as a second wallet owner.
  assert.doesNotMatch(provider, /from ["']@solana\/wallet-adapter-react(-ui)?["']/);
  assert.doesNotMatch(provider, /<(ConnectionProvider|WalletProvider|WalletModalProvider)[\s>]/);
  assert.match(provider, /externalWallets:/);
});

test("the app domain gates the full client behind wallet-host detection", () => {
  const column = read("../components/app-access-column.tsx");
  const page = read("../os-sign-in/page.tsx");
  assert.match(column, /useWalletHost/);
  assert.match(column, /WalletHostGateway/);
  // Ordinary browsers never get the raw sign-in without detection first.
  assert.match(page, /AppAccessColumn/);
  assert.doesNotMatch(page, /<WalletSignIn/);
});

test("Privy mounts only for supported wallet hosts, not the gateway", () => {
  const column = read("../components/app-access-column.tsx");
  const page = read("../os-sign-in/page.tsx");
  // The sign-in page no longer wraps everything in the wallet provider.
  assert.doesNotMatch(page, /WalletAuthProvider/);
  // The provider is mounted inside the column, only around the ready-state
  // sign-in — so the gateway/detection surfaces never depend on the SDK.
  const readyIndex = column.indexOf('host.status === "ready"');
  const providerIndex = column.indexOf("<WalletAuthProvider");
  assert.ok(readyIndex > 0 && providerIndex > readyIndex);
});

test("sign-out terminates the Privy session, not a dead wallet-adapter connection", () => {
  const signOut = read("../app/components/sign-out-button.tsx");
  assert.match(signOut, /await logout\(\)/);
  // The wallet-adapter stack is gone; there is nothing else to disconnect.
  assert.doesNotMatch(signOut, /from ["']@solana\/wallet-adapter-react(-ui)?["']/);
  // Local workspace state is cleared on sign-out.
  assert.match(signOut, /removeItem\(GWAP_OS_STORAGE_KEY\)/);
});

test("the edge proxy delegates isolation and session gating to the pure resolver", () => {
  const proxy = read("../../proxy.ts");
  assert.match(proxy, /resolveProxyAction/);
  // No ad-hoc host/path logic should linger in the runtime wrapper.
  assert.doesNotMatch(proxy, /isAllowedGwapAppPath/);
});
