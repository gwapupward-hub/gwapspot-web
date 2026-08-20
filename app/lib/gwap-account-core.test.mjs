import assert from "node:assert/strict";
import test from "node:test";
import {
  isGwapAccountId,
  isTelegramUserId,
  mergeGwapAccountIdentity,
  normalizeGwapAccountRecord,
} from "./gwap-account-core.ts";

const primaryWallet = "5K2NUTEaWUmCgXzS5giBtEb11uaPqGW5h1QKDmifFcjy";
const embeddedWallet = "6cDCrNYmasd1qmnvdLf8jyt9iFa3jW9VLzJhrb7X7SEH";
const now = "2026-08-20T08:00:00.000Z";

function baseRecord() {
  return {
    id: "gwap_12345678901234567890",
    privyUserIds: ["did:privy:primary"],
    telegramUserId: null,
    wallets: [{ address: primaryWallet, kind: "external", linkedAt: now }],
    primaryWallet,
    primaryGnsIdentity: null,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

test("validates canonical GWAP and Telegram identifiers", () => {
  assert.equal(isGwapAccountId("gwap_12345678901234567890"), true);
  assert.equal(isGwapAccountId("did:privy:123"), false);
  assert.equal(isTelegramUserId("123456789"), true);
  assert.equal(isTelegramUserId("0"), false);
});

test("normalizes a valid canonical account record", () => {
  const record = normalizeGwapAccountRecord({
    ...baseRecord(),
    telegramUserId: "123456789",
    privyUserIds: ["did:privy:primary", "did:privy:primary"],
  });
  assert.ok(record);
  assert.deepEqual(record.privyUserIds, ["did:privy:primary"]);
  assert.equal(record.telegramUserId, "123456789");
  assert.equal(record.primaryWallet, primaryWallet);
});

test("rejects records without an independent GWAP account id", () => {
  assert.equal(
    normalizeGwapAccountRecord({ ...baseRecord(), id: "did:privy:primary" }),
    null,
  );
});

test("merges additional Privy and wallet identities without losing the account", () => {
  const merged = mergeGwapAccountIdentity(baseRecord(), {
    privyUserId: "did:privy:secondary",
    verifiedWallet: primaryWallet,
    embeddedWallet,
    primaryGnsIdentity: "builder",
    now: "2026-08-20T08:30:00.000Z",
  });

  assert.equal(merged.id, "gwap_12345678901234567890");
  assert.deepEqual(merged.privyUserIds, ["did:privy:primary", "did:privy:secondary"]);
  assert.equal(merged.wallets.length, 2);
  assert.equal(merged.wallets.find((wallet) => wallet.address === embeddedWallet)?.kind, "embedded");
  assert.equal(merged.primaryGnsIdentity, "builder");
  assert.equal(merged.updatedAt, "2026-08-20T08:30:00.000Z");
});
