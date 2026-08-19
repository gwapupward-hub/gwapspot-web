import assert from "node:assert/strict";
import test from "node:test";
import {
  buildXVerificationPostIntentUrl,
  buildXVerificationPostText,
  challengeHashesMatch,
  extractVerificationChallenges,
  generateVerificationChallenge,
  hashVerificationChallenge,
  isChallengeExpired,
  isValidXUsername,
  normalizeChallengeText,
  normalizeXUsername,
} from "./gwapscore-social/core.ts";

test("normalizes and validates X usernames", () => {
  assert.equal(normalizeXUsername("  @GwapCreator "), "gwapcreator");
  assert.equal(isValidXUsername("@gwap_creator"), true);
  assert.equal(isValidXUsername("not-valid-handle"), false);
  assert.equal(isValidXUsername("abcdefghijklmnop"), false);
});

test("generates cryptographically random challenge-shaped tokens", () => {
  const first = generateVerificationChallenge();
  const second = generateVerificationChallenge();
  assert.match(first, /^GS-X-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.notEqual(first, second);
});

test("hash comparison is normalized and secret-aware", () => {
  const secret = "unit-test-secret";
  const left = hashVerificationChallenge("gs-x-abcd-1234-ffff", secret);
  const right = hashVerificationChallenge("  GS-X-ABCD-1234-FFFF  ", secret);
  assert.equal(challengeHashesMatch(left, right), true);
  assert.equal(normalizeChallengeText("  gs-x-code  "), "GS-X-CODE");
});

test("extracts proof tokens from public X post text", () => {
  assert.deepEqual(
    extractVerificationChallenges(
      "Verifying @gwapcreator. Challenge: gs-x-abcd-1234-ffff. Public proof.",
    ),
    ["GS-X-ABCD-1234-FFFF"],
  );
});

test("builds an X Web Intent without requiring user posting permission", () => {
  const challenge = "GS-X-ABCD-1234-FFFF";
  const text = buildXVerificationPostText("@GwapCreator", challenge);
  assert.match(text, /@gwapcreator/);
  assert.match(text, /GS-X-ABCD-1234-FFFF/);
  const intent = new URL(buildXVerificationPostIntentUrl("@GwapCreator", challenge));
  assert.equal(intent.origin, "https://x.com");
  assert.equal(intent.pathname, "/intent/tweet");
  assert.equal(intent.searchParams.get("text"), text);
});

test("challenge expiry is deterministic", () => {
  assert.equal(isChallengeExpired("2026-08-19T12:00:00.000Z", Date.parse("2026-08-19T12:00:01.000Z")), true);
  assert.equal(isChallengeExpired("2026-08-19T12:00:00.000Z", Date.parse("2026-08-19T11:59:59.000Z")), false);
});
