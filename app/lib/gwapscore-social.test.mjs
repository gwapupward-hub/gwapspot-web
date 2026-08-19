import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVerificationShareUrl,
  buildXVerificationPostIntentUrl,
  buildXVerificationPostText,
  challengeHashesMatch,
  extractVerificationChallenges,
  generateVerificationChallenge,
  hashVerificationChallenge,
  isChallengeExpired,
  isValidXUsername,
  isVerificationCardTheme,
  normalizeChallengeText,
  normalizeXUsername,
} from "./gwapscore-social/core.ts";

test("normalizes and validates X usernames", () => {
  assert.equal(normalizeXUsername("  @GwapCreator "), "gwapcreator");
  assert.equal(isValidXUsername("@gwap_creator"), true);
  assert.equal(isValidXUsername("not-valid-handle"), false);
  assert.equal(isValidXUsername("abcdefghijklmnop"), false);
});

test("accepts only the four aesthetic proof card themes", () => {
  for (const theme of ["orange", "red", "green", "purple"]) {
    assert.equal(isVerificationCardTheme(theme), true);
  }
  assert.equal(isVerificationCardTheme("gold"), false);
  assert.equal(isVerificationCardTheme(null), false);
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

test("extracts proof tokens from public post text without requiring an exact post body", () => {
  assert.deepEqual(
    extractVerificationChallenges(
      "Verifying control. Challenge: gs-x-abcd-1234-ffff. https://www.gwapspot.com/verify/x/test",
    ),
    ["GS-X-ABCD-1234-FFFF"],
  );
});

test("creates a canonical public proof URL for a challenge", () => {
  assert.equal(
    buildVerificationShareUrl("challenge-123"),
    "https://www.gwapspot.com/verify/x/challenge-123",
  );
});

test("builds an X Web Intent that includes the public proof link without posting permission", () => {
  const shareUrl = buildVerificationShareUrl("challenge-123");
  const text = buildXVerificationPostText(
    "@GwapCreator",
    "GS-X-ABCD-1234-FFFF",
    shareUrl,
  );
  assert.match(text, /Verifying control of @gwapcreator for GwapScore\./);
  assert.match(text, /Challenge: GS-X-ABCD-1234-FFFF/);
  assert.match(text, /https:\/\/www\.gwapspot\.com\/verify\/x\/challenge-123/);

  const intent = new URL(
    buildXVerificationPostIntentUrl(
      "GwapCreator",
      "GS-X-ABCD-1234-FFFF",
      shareUrl,
    ),
  );
  assert.equal(intent.origin, "https://x.com");
  assert.equal(intent.pathname, "/intent/tweet");
  assert.match(intent.searchParams.get("text") ?? "", /Challenge: GS-X-ABCD-1234-FFFF/);
  assert.match(intent.searchParams.get("text") ?? "", /gwapspot\.com\/verify\/x\/challenge-123/);
});

test("challenge expiry is deterministic", () => {
  assert.equal(
    isChallengeExpired(
      "2026-08-19T12:00:00.000Z",
      Date.parse("2026-08-19T12:00:01.000Z"),
    ),
    true,
  );
  assert.equal(
    isChallengeExpired(
      "2026-08-19T12:00:00.000Z",
      Date.parse("2026-08-19T11:59:59.000Z"),
    ),
    false,
  );
});
