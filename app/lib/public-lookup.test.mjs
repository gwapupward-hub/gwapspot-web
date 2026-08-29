import assert from "node:assert/strict";
import test from "node:test";
import {
  getPublicLookupSubject,
  normalizePublicLookup,
  PublicLookupValidationError,
  shortAddress,
} from "./public-lookup.ts";
import {
  buildPublicLookupShareUrl,
  readPublicLookupDeepLink,
} from "./public-share.ts";

test("normalizes .gwap names", () => {
  assert.deepEqual(normalizePublicLookup("name", " Tha-General.GWAP "), {
    mode: "name",
    value: "tha-general",
    fullName: "tha-general.gwap",
  });
});

test("rejects invalid .gwap names", () => {
  assert.throws(
    () => normalizePublicLookup("name", "-invalid"),
    PublicLookupValidationError,
  );
});

test("accepts canonical Solana wallet addresses", () => {
  const wallet = "11111111111111111111111111111111";
  assert.deepEqual(normalizePublicLookup("wallet", wallet), {
    mode: "wallet",
    value: wallet,
  });
});

test("rejects non-Solana wallet addresses", () => {
  assert.throws(
    () =>
      normalizePublicLookup(
        "wallet",
        "0x0000000000000000000000000000000000000000",
      ),
    /valid Solana wallet/,
  );
});

test("prefers the platform-set real client address", () => {
  const headers = new Headers({
    "x-real-ip": "203.0.113.8",
    "x-forwarded-for": "198.51.100.7, 203.0.113.8",
  });
  assert.equal(getPublicLookupSubject(headers), "203.0.113.8");
});

test("uses the last forwarded hop, which the caller cannot forge", () => {
  // The platform appends the real peer address rather than replacing the
  // header, so a caller-supplied first hop must never become the rate-limit
  // subject — otherwise rotating it defeats the limit entirely.
  const spoofed = new Headers({
    "x-forwarded-for": "1.2.3.4, 203.0.113.8",
  });
  assert.equal(getPublicLookupSubject(spoofed), "203.0.113.8");

  const rotated = new Headers({
    "x-forwarded-for": "9.9.9.9, 203.0.113.8",
  });
  assert.equal(
    getPublicLookupSubject(rotated),
    getPublicLookupSubject(spoofed),
    "a forged first hop must not change the rate-limit subject",
  );
});

test("handles a single-hop and whitespace-padded forwarded header", () => {
  assert.equal(
    getPublicLookupSubject(new Headers({ "x-forwarded-for": "203.0.113.8" })),
    "203.0.113.8",
  );
  assert.equal(
    getPublicLookupSubject(
      new Headers({ "x-forwarded-for": " 198.51.100.7 ,  203.0.113.8 " }),
    ),
    "203.0.113.8",
  );
});

test("falls back to a constant when no address is available", () => {
  assert.equal(getPublicLookupSubject(new Headers()), "unknown");
  assert.equal(
    getPublicLookupSubject(new Headers({ "x-forwarded-for": " , " })),
    "unknown",
  );
});

test("shortens long public addresses", () => {
  assert.equal(
    shortAddress("11111111111111111111111111111111"),
    "111111…1111",
  );
});

test("builds a canonical share link for a public lookup", () => {
  assert.equal(
    buildPublicLookupShareUrl(
      "https://www.gwapspot.com/ecosystem?old=value",
      "name",
      "tha-general.gwap",
    ),
    "https://www.gwapspot.com/?lookup=name&q=tha-general.gwap#top",
  );
});

test("reads valid lookup deep links and rejects incomplete ones", () => {
  assert.deepEqual(
    readPublicLookupDeepLink(
      "https://www.gwapspot.com/?lookup=wallet&q=11111111111111111111111111111111#top",
    ),
    { mode: "wallet", query: "11111111111111111111111111111111" },
  );
  assert.equal(
    readPublicLookupDeepLink("https://www.gwapspot.com/?lookup=name"),
    null,
  );
});
