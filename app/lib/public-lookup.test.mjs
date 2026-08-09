import assert from "node:assert/strict";
import test from "node:test";
import {
  getPublicLookupSubject,
  normalizePublicLookup,
  PublicLookupValidationError,
  shortAddress,
} from "./public-lookup.ts";

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

test("uses the first forwarded client address without exposing it in output", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.8, 10.0.0.2",
  });
  assert.equal(getPublicLookupSubject(headers), "203.0.113.8");
});

test("shortens long public addresses", () => {
  assert.equal(
    shortAddress("11111111111111111111111111111111"),
    "111111…1111",
  );
});
