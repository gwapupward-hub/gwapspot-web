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

test("an authenticated token opens /app on both hosts", () => {
  assert.deepEqual(
    resolveProxyAction({ ...base, pathname: "/app", hasPrivyToken: true }),
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
  assert.deepEqual(publicAction, {
    kind: "redirect",
    pathname: "/sign-in",
    redirectParam: "/app",
  });

  const appAction = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/app",
  });
  assert.deepEqual(appAction, {
    kind: "redirect",
    pathname: "/os-sign-in",
    redirectParam: "/app",
  });
});

test("a refreshable session tries silent refresh first", () => {
  const action = resolveProxyAction({
    ...base,
    host: "app.gwapspot.com",
    pathname: "/app/score",
    search: "?tab=history",
    hasPrivySession: true,
  });
  assert.deepEqual(action, {
    kind: "redirect",
    pathname: "/refresh",
    redirectParam: "/app/score?tab=history",
  });
});

test("no redirect loop: the final sign-in/refresh targets pass through the gate", () => {
  // The destinations an unauthenticated /app request is sent to must themselves
  // pass through, so a redirect can never bounce back into another redirect.
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
