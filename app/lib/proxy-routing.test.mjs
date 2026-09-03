import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveProxyAction } from "./proxy-routing.ts";

const base = {
  host: "www.gwapspot.com",
  pathname: "/",
  search: "",
  walletAuthConfigured: true,
  hasPrivyToken: false,
  hasPrivySession: false,
  authLoopBounceCount: 0,
};

test("rewrites the bare app host to the wallet-native splash", () => {
  const action = resolveProxyAction({ ...base, host: "app.gwapspot.com", pathname: "/" });
  assert.deepEqual(action, { kind: "rewrite", pathname: "/os-entry" });
});

test("normalizes /sign-in to /os-sign-in on the app host, preserving query", () => {
  const action = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/sign-in",
    search: "?redirect_url=/app",
  });
  assert.equal(action.kind, "redirect");
  assert.equal(action.pathname, "/os-sign-in");
  assert.equal(action.preserveSearch, true);
  assert.equal(action.sessionIssue, false);
});

test("sends marketing routes on the app host back to the splash", () => {
  for (const pathname of ["/about", "/ecosystem/gns", "/roadmap"]) {
    const action = resolveProxyAction({ ...base, host: "app.gwapspot.com", pathname });
    assert.deepEqual(action, { kind: "redirect", pathname: "/" }, pathname);
  }
});

test("lookalike hosts are not treated as the app domain", () => {
  // A lookalike host must NOT get the app rewrite; /about just passes through.
  const action = resolveProxyAction({
    ...base,
    host: "notapp.gwapspot.com",
    pathname: "/about",
  });
  assert.deepEqual(action, { kind: "next" });
});

test("non-app paths pass through on both hosts", () => {
  assert.deepEqual(
    resolveProxyAction({ ...base, pathname: "/ecosystem" }),
    { kind: "next" },
  );
  assert.deepEqual(
    resolveProxyAction({ ...base, host: "app.gwapspot.com", pathname: "/os-sign-in" }),
    { kind: "next" },
  );
});

test("an authenticated token opens /app on both hosts, and never touches the bounce cookie", () => {
  assert.deepEqual(
    resolveProxyAction({ ...base, pathname: "/app", hasPrivyToken: true, authLoopBounceCount: 1 }),
    { kind: "next" },
  );
  assert.deepEqual(
    resolveProxyAction({
      ...base,
      host: "app.gwapspot.com",
      pathname: "/app/vault",
      hasPrivyToken: true,
    }),
    { kind: "next" },
  );
});

test("unauthenticated /app routes to the host-appropriate sign-in with redirect_url", () => {
  const publicAction = resolveProxyAction({ ...base, pathname: "/app" });
  assert.equal(publicAction.kind, "redirect");
  assert.equal(publicAction.pathname, "/sign-in");
  assert.equal(publicAction.redirectParam, "/app");
  assert.equal(publicAction.sessionIssue, false);

  const appAction = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/app",
  });
  assert.equal(appAction.kind, "redirect");
  assert.equal(appAction.pathname, "/os-sign-in");
  assert.equal(appAction.redirectParam, "/app");
});

test("a refreshable session tries silent refresh first", () => {
  const action = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/app/score",
    search: "?tab=history",
    hasPrivySession: true,
  });
  assert.equal(action.kind, "redirect");
  assert.equal(action.pathname, "/refresh");
  assert.equal(action.redirectParam, "/app/score?tab=history");
});

test("no redirect loop in the static routing table: the sign-in/refresh targets pass through the gate", () => {
  // The destinations an unauthenticated /app request is sent to must themselves
  // pass through, so a redirect can never bounce back into another redirect
  // within a single request's routing decision.
  for (const pathname of ["/os-sign-in", "/refresh"]) {
    assert.deepEqual(
      resolveProxyAction({ ...base, host: "app.gwapspot.com", pathname }),
      { kind: "next" },
      pathname,
    );
  }
  // /sign-in normalizes once to /os-sign-in, which then passes through — a single
  // hop, not a loop.
  const normalized = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/sign-in",
  });
  assert.equal(normalized.kind, "redirect");
  assert.equal(normalized.pathname, "/os-sign-in");
  assert.deepEqual(
    resolveProxyAction({ ...base, host: "app.gwapspot.com", pathname: normalized.pathname }),
    { kind: "next" },
  );
});

test("unconfigured auth does not gate /app", () => {
  assert.deepEqual(
    resolveProxyAction({ ...base, pathname: "/app", walletAuthConfigured: false }),
    { kind: "next" },
  );
});

test("proxy.ts delegates to the pure resolver", () => {
  const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(source, /resolveProxyAction/);
});

// --- Redirect-loop protection --------------------------------------------
//
// The tests above prove the routing table itself has no cycle. These prove
// the separate, dynamic case: a session the server layout keeps rejecting
// even though this resolver considers the request's cookie good enough to
// pass through. That can't be caught by tracing the static routing graph -
// it depends on state (the bounce count) carried across requests.

test("increments the bounce cookie on the first hop through either loop chokepoint", () => {
  const viaSignIn = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/sign-in",
  });
  assert.deepEqual(viaSignIn.authLoopCookie, { action: "set", value: "1" });

  const viaAppGate = resolveProxyAction({ ...base, pathname: "/app" });
  assert.deepEqual(viaAppGate.authLoopCookie, { action: "set", value: "1" });
});

test("breaks the loop on the second consecutive hop through /sign-in: session_issue set, cookie cleared", () => {
  const action = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/sign-in",
    search: "?redirect_url=/app",
    authLoopBounceCount: 1,
  });
  assert.equal(action.sessionIssue, true);
  assert.deepEqual(action.authLoopCookie, { action: "clear" });
  // The rest of the query string is still preserved alongside session_issue.
  assert.equal(action.preserveSearch, true);
});

test("breaks the loop on the second consecutive hop through the /app gate, overriding a refreshable session", () => {
  const action = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/app",
    hasPrivySession: true,
    authLoopBounceCount: 1,
  });
  // Loop-detected routing overrides the privy-session -> /refresh path once
  // the loop is confirmed - retrying /refresh is itself part of what could
  // be looping.
  assert.equal(action.pathname, "/os-sign-in");
  assert.equal(action.sessionIssue, true);
  assert.deepEqual(action.authLoopCookie, { action: "clear" });
});

test("the disallowed-path redirect never touches the auth-loop cookie", () => {
  const action = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/about",
    authLoopBounceCount: 1,
  });
  assert.equal(action.authLoopCookie, undefined);
});
