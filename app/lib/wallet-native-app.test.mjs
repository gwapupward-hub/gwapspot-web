import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isAllowedGwapAppPath, isGwapAppHostname } from "./app-domain-routing.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const gate = read("../components/wallet-host-gate.tsx");
const detection = read("../components/use-wallet-host.ts");
const signIn = read("../components/wallet-sign-in.tsx");
const provider = read("../components/wallet-auth-provider.tsx");
const osSignInPage = read("../os-sign-in/page.tsx");
const appLayout = read("../app/layout.tsx");
const appSplash = read("../os-entry/splash.tsx");
const publicLayers = read("../components/public-experience-layers.tsx");
const proxy = read("../../proxy.ts");

test("both app-domain gates are enforced: exact hostname and wallet environment", () => {
  // Gate one lives in the proxy and matches the hostname exactly.
  assert.match(proxy, /isGwapAppHostname/);
  assert.equal(isGwapAppHostname("app.gwapspot.com"), true);
  assert.equal(isGwapAppHostname("app.gwapspot.com.attacker.test"), false);

  // Gate two establishes a supported wallet environment before GWAP OS renders.
  assert.match(gate, /export function WalletHostGate/);
  assert.match(gate, /if \(!isAppHost\) \{/);
  assert.match(gate, /phase === "detecting"/);
  assert.match(gate, /resolution\.status === "browser"/);
  assert.match(gate, /<WalletHostRequired onRetry=\{retry\} \/>/);
});

test("the wallet-host gate guards every GWAP OS surface on the app domain", () => {
  for (const source of [osSignInPage, appLayout]) {
    assert.match(source, /<WalletHostGate>/);
    assert.match(source, /<WalletAuthProvider variant="app">/);
  }
});

test("an ordinary browser gets the gateway, not a redirect and not the website", () => {
  assert.match(gate, /Open GWAP OS from your Solana wallet\./);
  assert.match(gate, /Open wallet instructions/);
  assert.match(gate, /Visit GwapSpot\.com/);
  // A false negative must be recoverable rather than a dead end.
  assert.match(gate, /Detect again/);
  // The gateway hands off; it never silently forwards or renders the site.
  assert.doesNotMatch(gate, /router\.replace|location\.replace|redirect\(/);
});

test("wallet detection is capability-first, never user-agent-first", () => {
  assert.match(detection, /wallet-standard:app-ready/);
  assert.match(detection, /wallet-standard:register-wallet/);
  assert.match(detection, /signMessage/);
  // Late injection inside a wallet WebView must not read as an ordinary browser.
  assert.match(detection, /DETECTION_SETTLE_MS/);
  assert.match(detection, /visibilitychange/);
});

test("the app client never offers email wallet creation", () => {
  assert.match(signIn, /\{isAppVariant \? null : \(/);
  assert.match(
    signIn,
    /The app client never offers email onboarding/,
  );
  // The public website keeps the path it owns.
  assert.match(signIn, /Create a Solana wallet with email/);
  assert.match(signIn, /login\(\{ loginMethods: \["email"\] \}\)/);
});

test("the app client enters with the host wallet instead of asking for one", () => {
  assert.match(signIn, /useResolvedWalletHost/);
  assert.match(signIn, /DETECTED/);
  assert.match(signIn, /Enter with \$\{hostName\}/);
  // A wallet that cannot prove ownership is an explicit failure state.
  assert.match(signIn, /hostCannotSign/);
  assert.match(signIn, /cannot sign the ownership message/);
});

test("one system owns wallet authentication", () => {
  // Privy runs selection, connection, the signature and the session; the
  // adapter stays inert so it cannot open a second connection flow.
  assert.match(provider, /autoConnect=\{false\}/);
  assert.match(provider, /const walletAdapters: \[\] = \[\]/);
  assert.doesNotMatch(signIn, /useConnectWallet|useWalletModal|useLoginWithSiws/);
  assert.doesNotMatch(signIn, /useWallet\(\)/);
});

test("app-host sign-in redirects go to the wallet gateway, never a loop", () => {
  // /app -> /os-sign-in on the app host, and /os-sign-in is a served app path,
  // so the round trip terminates instead of bouncing back to /app.
  assert.match(appLayout, /walletSignInPathForHost\(host\)/);
  assert.doesNotMatch(appLayout, /redirect\("\/sign-in\?redirect_url=\/app"\)/);
  assert.equal(isAllowedGwapAppPath("/os-sign-in"), true);
  assert.match(proxy, /pathname = "\/os-sign-in"/);
});

test("the splash always reaches an entry point it can escape through", () => {
  assert.match(appSplash, /revealFinalFrame/);
  assert.match(appSplash, /ABSOLUTE_PLAYBACK_DEADLINE_MS/);
  assert.match(appSplash, /onError=\{revealFinalFrame\}/);
  // The gate lives past the splash, so playback failure never blocks entry.
  assert.doesNotMatch(appSplash, /WalletHostGate/);
});

test("the public website keeps its own experience untouched", () => {
  // App-host and application routes opt out of the public marketing layers.
  assert.match(publicLayers, /if \(isAppHost \|\| isTelegram \|\| isApplicationExperience\) return null;/);
  // Off the app hostname the wallet gate is transparent.
  assert.match(gate, /Off the app hostname this is transparent/);
  // Marketing routes are still refused on the app domain.
  for (const pathname of ["/about", "/roadmap", "/changelog", "/ecosystem/gns"]) {
    assert.equal(isAllowedGwapAppPath(pathname), false, pathname);
  }
});

test("the wallet client keeps mobile WebView safe areas and touch targets", () => {
  const gateStyles = read("../components/wallet-host-gate.module.css");
  assert.match(gateStyles, /env\(safe-area-inset-top, 0px\)/);
  assert.match(gateStyles, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(gateStyles, /min-height: 100dvh/);
  assert.match(gateStyles, /min-height: 50px/);
  assert.match(gateStyles, /prefers-reduced-motion: reduce/);
});
