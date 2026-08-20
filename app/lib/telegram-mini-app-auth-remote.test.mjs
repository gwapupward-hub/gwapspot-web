import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TelegramMiniAppRemoteAuthError,
  TELEGRAM_MINI_APP_AUTH_CONTRACT_VERSION,
  verifyTelegramMiniAppInitDataRemotely,
} from "./telegram-mini-app-auth-remote.ts";

const internalApiKey = "k".repeat(48);
const identity = {
  telegramUserId: "123456789",
  firstName: "Emerald",
  lastName: "Builder",
  username: "gwap_builder",
  languageCode: "en",
  isPremium: true,
  photoUrl: null,
  authDate: 1_800_000_000,
  startParam: "daily",
};

test("verifies initData through the isolated Daily Ideas auth service", async () => {
  const result = await verifyTelegramMiniAppInitDataRemotely("query_id=test&hash=abc", {
    internalApiKey,
    endpoint: "https://daily-ideas.example/api/telegram/verify-mini-app",
    requestId: "request-telegram-auth-1",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://daily-ideas.example/api/telegram/verify-mini-app");
      assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.headers.Authorization, `Bearer ${internalApiKey}`);
      assert.equal(init?.headers["X-Daily-Ideas-Contract-Version"], TELEGRAM_MINI_APP_AUTH_CONTRACT_VERSION);
      assert.deepEqual(JSON.parse(String(init?.body)), { initData: "query_id=test&hash=abc" });
      return new Response(JSON.stringify({
        contractVersion: TELEGRAM_MINI_APP_AUTH_CONTRACT_VERSION,
        identity,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.deepEqual(result, identity);
});

test("returns null when Telegram signature verification rejects the launch", async () => {
  const result = await verifyTelegramMiniAppInitDataRemotely("query_id=test&hash=bad", {
    internalApiKey,
    endpoint: "https://daily-ideas.example/api/telegram/verify-mini-app",
    fetchImpl: async () => new Response(JSON.stringify({ error: "Invalid Telegram session" }), { status: 401 }),
  });
  assert.equal(result, null);
});

test("fails closed when the verifier service is unavailable", async () => {
  await assert.rejects(
    () => verifyTelegramMiniAppInitDataRemotely("query_id=test&hash=abc", {
      internalApiKey,
      endpoint: "https://daily-ideas.example/api/telegram/verify-mini-app",
      fetchImpl: async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }),
    }),
    (error) => error instanceof TelegramMiniAppRemoteAuthError && error.status === 503,
  );
});
