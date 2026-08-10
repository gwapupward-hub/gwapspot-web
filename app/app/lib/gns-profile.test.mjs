import assert from "node:assert/strict";
import test from "node:test";
import {
  GnsProfileValidationError,
  assertAuthorizedGnsProfileUpdate,
  canonicalJson,
  normalizeGnsProfilePayload,
} from "./gns-profile.ts";

const owner = "11111111111111111111111111111111";

const payload = normalizeGnsProfilePayload({
  bio: "  Building useful things.  ",
  avatar: "https://example.com/avatar.png",
  banner: null,
  socials: {
    twitter: "@builder",
    discord: null,
    telegram: null,
    instagram: null,
    website: "https://example.com",
  },
  links: [{ title: "Docs", url: "https://example.com/docs", icon: null }],
  theme: "midnight",
  is_score_hidden: false,
  payments: {
    sol_enabled: true,
    usdc_enabled: false,
    recipient_wallet: owner,
  },
});

test("normalizes every signed GNS profile field before signing", () => {
  assert.equal(payload.bio, "Building useful things.");
  assert.equal(payload.socials.website, "https://example.com/");
  assert.deepEqual(payload.links, [
    {
      title: "Docs",
      url: "https://example.com/docs",
      icon: null,
      order: 0,
    },
  ]);
});

test("canonical JSON recursively sorts keys for the GNS v2 digest", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, b: [3, { d: 4, c: 5 }] } }),
    '{"a":{"b":[3,{"c":5,"d":4}],"y":2},"z":1}',
  );
});

test("authorizes only the authenticated owner", () => {
  assert.doesNotThrow(() =>
    assertAuthorizedGnsProfileUpdate({
      profile: { owner, is_genesis: false },
      verifiedWallet: owner,
      signer: owner,
      payload,
    }),
  );
  assert.throws(
    () =>
      assertAuthorizedGnsProfileUpdate({
        profile: { owner, is_genesis: false },
        verifiedWallet: "SysvarRent111111111111111111111111111111111",
        signer: owner,
        payload,
      }),
    GnsProfileValidationError,
  );
});

test("preserves the Genesis-only score visibility permission", () => {
  const hidden = { ...payload, is_score_hidden: true };
  assert.throws(
    () =>
      assertAuthorizedGnsProfileUpdate({
        profile: { owner, is_genesis: false },
        verifiedWallet: owner,
        signer: owner,
        payload: hidden,
      }),
    /Only Genesis identities/,
  );
  assert.doesNotThrow(() =>
    assertAuthorizedGnsProfileUpdate({
      profile: { owner, is_genesis: true },
      verifiedWallet: owner,
      signer: owner,
      payload: hidden,
    }),
  );
});

test("rejects invalid URLs, too many links, and invalid payment wallets", () => {
  assert.throws(
    () => normalizeGnsProfilePayload({ ...payload, avatar: "javascript:alert(1)" }),
    /complete http/,
  );
  assert.throws(
    () => normalizeGnsProfilePayload({ ...payload, links: Array(21).fill(payload.links[0]) }),
    /no more than 20/,
  );
  assert.throws(
    () =>
      normalizeGnsProfilePayload({
        ...payload,
        payments: { ...payload.payments, recipient_wallet: "not-a-wallet" },
      }),
    /Solana address/,
  );
});
