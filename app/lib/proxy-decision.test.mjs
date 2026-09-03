import assert from "node:assert/strict";
import test from "node:test";
import { decideProxyAction } from "./proxy-decision.ts";

const APP_HOST = "app.gwapspot.com";
const PUBLIC_HOST = "www.gwapspot.com";

function facts(overrides = {}) {
  return {
    host: PUBLIC_HOST,
    pathname: "/",
    search: "",
    hasPrivyToken: false,
    hasPrivySession: false,
    walletAuthConfigured: true,
    authLoopBounceCount: 0,
    ...overrides,
  };
}

// --- App-domain root rewrite -------------------------------------------

test("rewrites the app-domain root to the splash", () => {
  const decision = decideProxyAction(facts({ host: APP_HOST, pathname: "/" }));
  assert.deepEqual(decision, { kind: "rewrite", pathname: "/os-entry" });
});

test("does not rewrite the public-domain root", () => {
  const decision = decideProxyAction(facts({ host: PUBLIC_HOST, pathname: "/" }));
  assert.equal(decision.kind, "next");
});

// --- App-domain /sign-in -> /os-sign-in ---------------------------------

test("redirects app-domain /sign-in to /os-sign-in, preserving the query", () => {
  const decision = decideProxyAction(
    facts({ host: APP_HOST, pathname: "/sign-in", search: "?redirect_url=%2Fapp" }),
  );
  assert.equal(decision.kind, "redirect");
  assert.equal(decision.pathname, "/os-sign-in");
  assert.deepEqual(decision.query, { mode: "preserve", add: {} });
  assert.deepEqual(decision.authLoopCookie, { action: "set", value: "1" });
});

test("also redirects a /sign-in subpath on the app domain", () => {
  const decision = decideProxyAction(
    facts({ host: APP_HOST, pathname: "/sign-in/factor-one" }),
  );
  assert.equal(decision.pathname, "/os-sign-in");
});

test("flags session_issue and clears the bounce cookie once the loop limit is hit", () => {
  const decision = decideProxyAction(
    facts({ host: APP_HOST, pathname: "/sign-in", authLoopBounceCount: 1 }),
  );
  assert.deepEqual(decision.query, { mode: "preserve", add: { session_issue: "1" } });
  assert.deepEqual(decision.authLoopCookie, { action: "clear" });
});

// --- App-domain path allowlist -------------------------------------------

test("redirects a disallowed app-domain path to the root, discarding its query", () => {
  const decision = decideProxyAction(
    facts({ host: APP_HOST, pathname: "/about", search: "?utm_source=x" }),
  );
  assert.equal(decision.kind, "redirect");
  assert.equal(decision.pathname, "/");
  assert.deepEqual(decision.query, { mode: "replace", params: {} });
  assert.equal(decision.authLoopCookie, null);
});

test("passes an allowed app-domain path through untouched", () => {
  const decision = decideProxyAction(
    facts({ host: APP_HOST, pathname: "/app/vault", hasPrivyToken: true }),
  );
  assert.equal(decision.kind, "next");
});

// --- Non-/app paths are never gated on the public domain ------------------
// (On the app domain, a marketing path like /ecosystem is still rejected by
// the allowlist above - that's Phase 1 isolation, not the /app auth gate.)

test("never auth-gates a path outside /app on the public domain", () => {
  const decision = decideProxyAction(facts({ host: PUBLIC_HOST, pathname: "/ecosystem" }));
  assert.equal(decision.kind, "next");
});

// --- /app auth gate --------------------------------------------------------

test("lets /app through when wallet auth isn't configured", () => {
  const decision = decideProxyAction(
    facts({ pathname: "/app", walletAuthConfigured: false }),
  );
  assert.equal(decision.kind, "next");
});

test("lets /app through when a privy-token cookie is present, untouched", () => {
  const decision = decideProxyAction(
    facts({ pathname: "/app", hasPrivyToken: true, authLoopBounceCount: 1 }),
  );
  assert.deepEqual(decision, { kind: "next" });
});

test("sends /app with no session at all to /sign-in on the public domain", () => {
  const decision = decideProxyAction(facts({ host: PUBLIC_HOST, pathname: "/app" }));
  assert.equal(decision.kind, "redirect");
  assert.equal(decision.pathname, "/sign-in");
  assert.deepEqual(decision.query, {
    mode: "replace",
    params: { redirect_url: "/app" },
  });
});

test("sends /app with no session at all to /os-sign-in on the app domain", () => {
  const decision = decideProxyAction(facts({ host: APP_HOST, pathname: "/app" }));
  assert.equal(decision.pathname, "/os-sign-in");
});

test("sends /app with an unrefreshed session (privy-session but no token) to /refresh", () => {
  const decision = decideProxyAction(
    facts({ host: PUBLIC_HOST, pathname: "/app/settings", hasPrivySession: true }),
  );
  assert.equal(decision.pathname, "/refresh");
  assert.deepEqual(decision.query, {
    mode: "replace",
    params: { redirect_url: "/app/settings" },
  });
});

test("preserves the original path and query string in redirect_url", () => {
  const decision = decideProxyAction(
    facts({ pathname: "/app/ideas", search: "?tab=saved" }),
  );
  assert.equal(decision.query.params.redirect_url, "/app/ideas?tab=saved");
});

test("increments the bounce cookie on the first two /app gate hops", () => {
  const first = decideProxyAction(facts({ pathname: "/app", authLoopBounceCount: 0 }));
  assert.deepEqual(first.authLoopCookie, { action: "set", value: "1" });
});

test("breaks the loop on the second consecutive /app gate hop: session_issue set, cookie cleared", () => {
  const decision = decideProxyAction(
    facts({ host: APP_HOST, pathname: "/app", authLoopBounceCount: 1, hasPrivySession: true }),
  );
  // Loop-detected routing overrides the privy-session -> /refresh path -
  // once the loop is confirmed, land on sign-in instead of retrying refresh.
  assert.equal(decision.pathname, "/os-sign-in");
  assert.deepEqual(decision.query, {
    mode: "replace",
    params: { redirect_url: "/app", session_issue: "1" },
  });
  assert.deepEqual(decision.authLoopCookie, { action: "clear" });
});

// --- Lookalike and suffix hostnames stay off the app-domain branches -----

test("does not treat a lookalike hostname as the app domain", () => {
  const decision = decideProxyAction(
    facts({ host: "evil-app.gwapspot.com.attacker.test", pathname: "/" }),
  );
  assert.equal(decision.kind, "next");
});

test("does not treat a suffix-matching hostname as the app domain", () => {
  const decision = decideProxyAction(
    facts({ host: "notapp.gwapspot.com", pathname: "/sign-in" }),
  );
  // Falls through to the generic /sign-in path, which isn't gated at all -
  // only /app is.
  assert.equal(decision.kind, "next");
});
