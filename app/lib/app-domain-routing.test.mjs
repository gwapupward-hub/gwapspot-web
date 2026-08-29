import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAP_APP_HOSTNAME,
  isAllowedGwapAppPath,
  isGwapAppHostname,
  normalizeHostname,
  walletAuthVariantForHost,
  walletSignInPathForHost,
} from "./app-domain-routing.ts";

test("normalizes host headers to a bare hostname", () => {
  assert.equal(normalizeHostname("app.gwapspot.com"), GWAP_APP_HOSTNAME);
  assert.equal(normalizeHostname("APP.GwapSpot.com"), GWAP_APP_HOSTNAME);
  assert.equal(normalizeHostname("app.gwapspot.com:443"), GWAP_APP_HOSTNAME);
  assert.equal(normalizeHostname("  app.gwapspot.com  "), GWAP_APP_HOSTNAME);
});

test("uses only the first hop of a comma-separated forwarded host", () => {
  assert.equal(
    normalizeHostname("app.gwapspot.com, proxy.internal"),
    GWAP_APP_HOSTNAME,
  );
});

test("unwraps bracketed IPv6 literals", () => {
  assert.equal(normalizeHostname("[::1]:3000"), "::1");
  assert.equal(normalizeHostname("[2001:db8::1]"), "2001:db8::1");
  assert.equal(normalizeHostname("[::1"), "::1");
});

test("treats missing and empty host headers as not the app domain", () => {
  assert.equal(normalizeHostname(null), "");
  assert.equal(normalizeHostname(undefined), "");
  assert.equal(normalizeHostname(""), "");
  assert.equal(isGwapAppHostname(null), false);
  assert.equal(isGwapAppHostname(""), false);
});

test("matches the app hostname exactly, not by suffix", () => {
  assert.equal(isGwapAppHostname("app.gwapspot.com"), true);
  assert.equal(isGwapAppHostname("app.gwapspot.com:8443"), true);
  assert.equal(isGwapAppHostname("www.gwapspot.com"), false);
  assert.equal(isGwapAppHostname("gwapspot.com"), false);
  // A lookalike must not be admitted just because it ends with the real host.
  assert.equal(isGwapAppHostname("evil-app.gwapspot.com.attacker.test"), false);
  assert.equal(isGwapAppHostname("notapp.gwapspot.com"), false);
});

test("admits the paths the app domain is allowed to serve", () => {
  for (const pathname of [
    "/",
    "/refresh",
    "/sign-in",
    "/sign-in/factor-one",
    "/os-entry",
    "/os-entry/step",
    "/os-sign-in",
    "/os-sign-in/callback",
    "/app",
    "/app/vault",
  ]) {
    assert.equal(isAllowedGwapAppPath(pathname), true, pathname);
  }
});

test("rejects marketing paths on the app domain", () => {
  for (const pathname of [
    "/about",
    "/roadmap",
    "/changelog",
    "/ecosystem/gns",
    // Prefix lookalikes must not slip through the startsWith checks.
    "/application",
    "/apps",
    "/sign-in-now",
    "/os-entrypoint",
  ]) {
    assert.equal(isAllowedGwapAppPath(pathname), false, pathname);
  }
});

test("sends each host to its own sign-in gateway", () => {
  assert.equal(walletSignInPathForHost("app.gwapspot.com"), "/os-sign-in");
  assert.equal(walletSignInPathForHost("app.gwapspot.com:443"), "/os-sign-in");
  assert.equal(walletSignInPathForHost("www.gwapspot.com"), "/sign-in");
  assert.equal(walletSignInPathForHost("gwapspot.com"), "/sign-in");
  assert.equal(walletSignInPathForHost(null), "/sign-in");
});

test("mounts the wallet-only auth client on the app host alone", () => {
  assert.equal(walletAuthVariantForHost("app.gwapspot.com"), "app");
  assert.equal(walletAuthVariantForHost("www.gwapspot.com"), "public");
  assert.equal(walletAuthVariantForHost("gwapspot.com"), "public");
  assert.equal(walletAuthVariantForHost(null), "public");
});
