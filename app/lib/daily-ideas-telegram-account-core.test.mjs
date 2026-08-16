import assert from "node:assert/strict";
import test from "node:test";
import {
  getTelegramAccountId,
  isValidInternalApiKey,
  normalizeTelegramAccountInput,
} from "./daily-ideas-telegram-account-core.ts";

test("normalizes a Telegram account around the immutable user ID", () => {
  assert.deepEqual(
    normalizeTelegramAccountInput({
      telegramUserId: 123456789,
      username: "@BuilderOne",
      firstName: "  Ada  ",
      lastName: "Lovelace",
      languageCode: "en-US",
    }),
    {
      telegramUserId: "123456789",
      username: "BuilderOne",
      firstName: "Ada",
      lastName: "Lovelace",
      languageCode: "en-US",
    },
  );
});

test("supports users without a username and keeps identity stable across username changes", () => {
  const withoutUsername = normalizeTelegramAccountInput({ telegramUserId: "987654321" });
  const changedUsername = normalizeTelegramAccountInput({
    telegramUserId: "987654321",
    username: "new_name",
  });

  assert.equal(withoutUsername?.username, null);
  assert.equal(changedUsername?.username, "new_name");
  assert.equal(
    getTelegramAccountId(withoutUsername?.telegramUserId || ""),
    getTelegramAccountId(changedUsername?.telegramUserId || ""),
  );
});

test("rejects malformed Telegram identifiers and language codes", () => {
  assert.equal(normalizeTelegramAccountInput({ telegramUserId: 0 }), null);
  assert.equal(normalizeTelegramAccountInput({ telegramUserId: Number.MAX_SAFE_INTEGER + 1 }), null);
  assert.equal(normalizeTelegramAccountInput({ telegramUserId: "not-an-id" }), null);
  assert.equal(normalizeTelegramAccountInput({ telegramUserId: "123", languageCode: "<script>" }), null);
});

test("requires an exact high-entropy internal API bearer credential", () => {
  const key = "a".repeat(48);
  assert.equal(isValidInternalApiKey(`Bearer ${key}`, key), true);
  assert.equal(isValidInternalApiKey(`Bearer ${"b".repeat(48)}`, key), false);
  assert.equal(isValidInternalApiKey(key, key), false);
  assert.equal(isValidInternalApiKey("Bearer short", "short"), false);
});
