import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyTelegramMiniAppInitData } from "./telegram-mini-app-auth-core.ts";

const botToken = "123456789:test-bot-token-for-mini-app-validation";
const nowSeconds = 1_787_198_400;

function signedInitData(overrides = {}) {
  const values = {
    auth_date: String(nowSeconds),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    start_param: "daily",
    user: JSON.stringify({
      id: 123456789,
      first_name: "Emerald",
      last_name: "Builder",
      username: "gwap_builder",
      language_code: "en",
      is_premium: true,
    }),
    ...overrides,
  };
  const params = new URLSearchParams(values);
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

test("accepts a valid, fresh Telegram Mini App payload", () => {
  const identity = verifyTelegramMiniAppInitData(signedInitData(), { botToken, nowSeconds });
  assert.deepEqual(identity, {
    telegramUserId: "123456789",
    firstName: "Emerald",
    lastName: "Builder",
    username: "gwap_builder",
    languageCode: "en",
    isPremium: true,
    photoUrl: null,
    authDate: nowSeconds,
    startParam: "daily",
  });
});

test("rejects a payload whose authenticated user data was altered", () => {
  const original = signedInitData();
  const params = new URLSearchParams(original);
  params.set("user", JSON.stringify({ id: 999999999, first_name: "Spoofed" }));
  assert.equal(verifyTelegramMiniAppInitData(params.toString(), { botToken, nowSeconds }), null);
});

test("rejects an expired payload even when its HMAC is valid", () => {
  const initData = signedInitData({ auth_date: String(nowSeconds - 901) });
  assert.equal(verifyTelegramMiniAppInitData(initData, { botToken, nowSeconds }), null);
});

test("rejects a payload signed with a different bot token", () => {
  assert.equal(verifyTelegramMiniAppInitData(signedInitData(), { botToken: "different-token", nowSeconds }), null);
});
