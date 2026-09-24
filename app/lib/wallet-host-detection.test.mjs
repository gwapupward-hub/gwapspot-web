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

test("wallet-host hook discovers modern Wallet Standard registrations", () => {
  const hook = read("../components/use-wallet-host.ts");
  // Modern Wallet Standard is event-based. The app must consume the callback
  // carried by register-wallet and announce app-ready so wallets that loaded
  // first can register synchronously.
  assert.match(hook, /wallet-standard:register-wallet/);
  assert.match(hook, /wallet-standard:app-ready/);
  assert.match(hook, /new CustomEvent\("wallet-standard:app-ready"/);
  assert.match(hook, /typeof callback === "function"/);
  assert.match(hook, /callback as \(api: WalletStandardRegisterApi\)/);
  assert.match(hook, /standardSignerCount = Math\.max/);
});

test("app.gwapspot.com lets ordinary browsers reach wallet-or-email sign-in", () => {
  const column = read("../components/app-access-column.tsx");
  assert.match(column, /WalletAuthProvider/);
  assert.match(column, /WalletSignIn/);
  assert.doesNotMatch(column, /useWalletHost/);
  assert.doesNotMatch(column, /WalletHostGateway/);

  const signInPage = read("../os-sign-in/page.tsx");
  assert.match(signInPage, /AppAccessColumn/);
  assert.doesNotMatch(signInPage, /<WalletSignIn/);
});

test("the app variant exposes email OTP and embedded Solana onboarding", () => {
  const wallet = read("../components/wallet-sign-in.tsx");
  const provider = read("../components/wallet-auth-provider.tsx");

  assert.match(wallet, /login\(\{ loginMethods: \["email"\] \}\)/);
  assert.match(wallet, /Continue with email/);
  assert.match(wallet, /embedded Solana wallet/);
  assert.match(provider, /loginMethods: \["wallet", "email"\]/);
  assert.match(provider, /solana: \{ createOnLogin: "users-without-wallets" \}/);
  assert.match(provider, /ethereum: \{ createOnLogin: "off" \}/);
});

test("the wallet-host gateway keeps the full app unavailable and offers wallet entry", () => {
  const gateway = read("../components/wallet-host-gateway.tsx");
  assert.match(gateway, /WALLET REQUIRED/);
  assert.match(gateway, /phantom\.app\/ul\/browse/);
  assert.match(gateway, /Re-check for your wallet/);
  // The gateway must not embed the authenticated GwapOS shell.
  assert.doesNotMatch(gateway, /OsShell|useGwapOs/);
});
