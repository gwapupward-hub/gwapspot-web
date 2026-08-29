import assert from "node:assert/strict";
import test from "node:test";
import { getSafeRedirectPath } from "./safe-redirect.ts";

test("keeps legitimate in-app paths", () => {
  assert.equal(getSafeRedirectPath("/app"), "/app");
  assert.equal(getSafeRedirectPath("/app/vault"), "/app/vault");
  assert.equal(getSafeRedirectPath("/app/score?tab=history"), "/app/score?tab=history");
  assert.equal(getSafeRedirectPath("/app/profile#panel"), "/app/profile#panel");
  assert.equal(getSafeRedirectPath("  /app/settings  "), "/app/settings");
});

test("falls back for non-string and empty input", () => {
  assert.equal(getSafeRedirectPath(undefined), "/app");
  assert.equal(getSafeRedirectPath(null), "/app");
  assert.equal(getSafeRedirectPath(42), "/app");
  assert.equal(getSafeRedirectPath(["/app/vault"]), "/app");
  assert.equal(getSafeRedirectPath(""), "/app");
  assert.equal(getSafeRedirectPath("/app/vault", "/os-entry"), "/app/vault");
  assert.equal(getSafeRedirectPath("", "/os-entry"), "/os-entry");
});

test("rejects absolute and protocol-relative targets", () => {
  assert.equal(getSafeRedirectPath("https://evil.com"), "/app");
  assert.equal(getSafeRedirectPath("//evil.com"), "/app");
  assert.equal(getSafeRedirectPath("///evil.com"), "/app");
  assert.equal(getSafeRedirectPath("app/vault"), "/app");
});

test("rejects backslash authority tricks", () => {
  assert.equal(getSafeRedirectPath("/\\evil.com"), "/app");
  assert.equal(getSafeRedirectPath("/\\\\evil.com"), "/app");
  assert.equal(getSafeRedirectPath("/app\\..\\evil.com"), "/app");
});

test("rejects control characters browsers strip from URLs", () => {
  // Each of these becomes "//evil.com" — a protocol-relative URL — after the
  // browser removes the stripped character, so the "//" guard alone misses them.
  assert.equal(getSafeRedirectPath("/\t/evil.com"), "/app");
  assert.equal(getSafeRedirectPath("/\n/evil.com"), "/app");
  assert.equal(getSafeRedirectPath("/\r/evil.com"), "/app");
  assert.equal(getSafeRedirectPath("/\u0000/evil.com"), "/app");
  assert.equal(getSafeRedirectPath("/\u007f/evil.com"), "/app");
  // Interior, not merely leading/trailing — .trim() would not have caught it.
  assert.equal(getSafeRedirectPath("/app\t/../../evil.com"), "/app");
});
