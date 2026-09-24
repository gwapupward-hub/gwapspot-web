// Aggregate authentication regression guards. These source-level invariants fail
// loudly if a future change reintroduces a second auth owner, drops the
// duplicate-callback guard, or removes the app-domain wallet/email entry paths.

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

test("the app domain routes through the unified wallet-or-email access column", () => {
  const column = read("../components/app-access-column.tsx");
  const page = read("../os-sign-in/page.tsx");

  assert.match(page, /AppAccessColumn/);
  assert.doesNotMatch(page, /<WalletSignIn/);
  assert.match(column, /WalletAuthProvider/);
  assert.match(column, /WalletSignIn/);
  assert.doesNotMatch(column, /useWalletHost/);
  assert.doesNotMatch(column, /WalletHostGateway/);
});

test("Privy mounts on the app sign-in surface for ordinary browsers too", () => {
  const column = read("../components/app-access-column.tsx");
  const page = read("../os-sign-in/page.tsx");

  // The server page stays provider-free; the client access column owns Privy.
  assert.doesNotMatch(page, /WalletAuthProvider/);
  const providerIndex = column.indexOf("<WalletAuthProvider");
  const signInIndex = column.indexOf("<WalletSignIn");
  assert.ok(providerIndex > 0 && signInIndex > providerIndex);
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
