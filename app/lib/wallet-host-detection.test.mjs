import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyWalletHost,
  isSupportedWalletHost,
  readWalletHostEnvironment,
} from "./wallet-host-detection.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("classifies an ordinary browser with no providers as missing", () => {
  const detection = classifyWalletHost({});
  assert.equal(detection.status, "missing");
  assert.equal(detection.provider, null);
  assert.equal(detection.canSignMessage, false);
  assert.equal(isSupportedWalletHost(detection), false);
});

test("recognizes Phantom through provider capabilities, not user agent", () => {
  const detection = classifyWalletHost({
    phantomSolana: { isPhantom: true, signMessage: () => {} },
  });
  assert.equal(detection.status, "ready");
  assert.equal(detection.provider, "phantom");
  assert.equal(detection.canSignMessage, true);
  assert.equal(isSupportedWalletHost(detection), true);
});

test("recognizes Jupiter through provider capabilities", () => {
  const detection = classifyWalletHost({
    jupiter: { isJupiter: true, signIn: () => {} },
  });
  assert.equal(detection.status, "ready");
  assert.equal(detection.provider, "jupiter");
  assert.equal(detection.canSignMessage, true);
});

test("accepts signMessage OR signIn as a signing capability", () => {
  assert.equal(
    classifyWalletHost({ solana: { signMessage: () => {} } }).status,
    "ready",
  );
  assert.equal(
    classifyWalletHost({ solana: { signIn: () => {} } }).status,
    "ready",
  );
});

test("treats a provider without signing capability as unsupported", () => {
  const detection = classifyWalletHost({
    solana: { isSolflare: true, connect: () => {} },
  });
  assert.equal(detection.status, "unsupported");
  assert.equal(detection.provider, "solflare");
  assert.equal(detection.canSignMessage, false);
});

test("recognizes a Wallet Standard signer even without a window provider", () => {
  const detection = classifyWalletHost({ standardSignerCount: 1 });
  assert.equal(detection.status, "ready");
  assert.equal(detection.canSignMessage, true);
});

test("prefers a signing-capable provider over an incapable one", () => {
  const detection = classifyWalletHost({
    solana: { connect: () => {} },
    phantomSolana: { isPhantom: true, signMessage: () => {} },
  });
  assert.equal(detection.status, "ready");
  assert.equal(detection.provider, "phantom");
});

test("never returns detecting from the pure snapshot classifier", () => {
  for (const env of [
    {},
    { solana: { connect: () => {} } },
    { phantomSolana: { isPhantom: true, signMessage: () => {} } },
  ]) {
    assert.notEqual(classifyWalletHost(env).status, "detecting");
  }
});

test("readWalletHostEnvironment is SSR-safe without a window", () => {
  const env = readWalletHostEnvironment(undefined);
  assert.deepEqual(env, {});
});

test("readWalletHostEnvironment maps window globals to the environment", () => {
  const fakeWindow = {
    solana: { isPhantom: true, signMessage: () => {} },
    phantom: { solana: { isPhantom: true, signMessage: () => {} } },
    jupiter: { isJupiter: true, signIn: () => {} },
    navigator: { wallets: { get: () => [] } },
  };
  const env = readWalletHostEnvironment(fakeWindow);
  assert.equal(env.solana?.isPhantom, true);
  assert.equal(env.phantomSolana?.isPhantom, true);
  assert.equal(env.jupiter?.isJupiter, true);
  assert.equal(env.standardSignerCount, 0);

  assert.equal(classifyWalletHost(env).status, "ready");
});

test("counts Wallet Standard wallets that advertise a Solana signing feature", () => {
  const fakeWindow = {
    navigator: {
      wallets: {
        get: () => [
          { features: { "solana:signMessage": {} } },
          { features: { "standard:connect": {} } },
          { features: { "solana:signIn": {} } },
        ],
      },
    },
  };
  const env = readWalletHostEnvironment(fakeWindow);
  assert.equal(env.standardSignerCount, 2);
});

test("app.gwapspot.com renders the wallet-host gateway for ordinary browsers", () => {
  const column = read("../components/app-access-column.tsx");
  // Detection gates what the app domain serves.
  assert.match(column, /useWalletHost/);
  assert.match(column, /host\.status === "detecting"/);
  assert.match(column, /host\.status === "ready"/);
  assert.match(column, /WalletHostGateway/);
  assert.match(column, /WalletSignIn/);

  const signInPage = read("../os-sign-in/page.tsx");
  // The app sign-in page must route through the gateway-aware column, never the
  // raw sign-in component directly.
  assert.match(signInPage, /AppAccessColumn/);
  assert.doesNotMatch(signInPage, /<WalletSignIn/);
});

test("the app variant of wallet sign-in excludes email-wallet onboarding", () => {
  const wallet = read("../components/wallet-sign-in.tsx");
  // Email creation stays available for the public variant...
  assert.match(wallet, /login\(\{ loginMethods: \["email"\] \}\)/);
  // ...but the email onboarding UI is gated behind the non-app branch.
  assert.match(wallet, /\{isAppVariant \? \(/);
  assert.match(wallet, /wallet-auth-app-hint/);
  // The "create with email" button must live in the public-only branch.
  const emailButtonIndex = wallet.indexOf("Create a Solana wallet with email");
  const nonAppBranchIndex = wallet.indexOf(") : (");
  assert.ok(emailButtonIndex > 0);
  assert.ok(
    nonAppBranchIndex > 0 && nonAppBranchIndex < emailButtonIndex,
    "email onboarding button must be inside the non-app branch",
  );
});

test("the wallet-host gateway keeps the full app unavailable and offers wallet entry", () => {
  const gateway = read("../components/wallet-host-gateway.tsx");
  assert.match(gateway, /WALLET REQUIRED/);
  assert.match(gateway, /phantom\.app\/ul\/browse/);
  assert.match(gateway, /Re-check for your wallet/);
  // The gateway must not embed the authenticated GwapOS shell.
  assert.doesNotMatch(gateway, /OsShell|useGwapOs/);
});
