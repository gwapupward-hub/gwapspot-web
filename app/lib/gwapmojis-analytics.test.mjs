import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAPMOJIS_EVENTS,
  gwapMojisDownloadInstructions,
  resolveGwapMojisDeviceType,
  resolveGwapMojisSource,
  resolveGwapMojisTelegramUrl,
} from "./gwapmojis-analytics.ts";

test("the campaign emits exactly the agreed event names", () => {
  assert.deepEqual(GWAPMOJIS_EVENTS, {
    viewed: "gwapmojis_viewed",
    packDownloadStarted: "gwapmojis_pack_download_started",
    packDownloadRetry: "gwapmojis_pack_download_retry",
    stickerOpened: "gwapmojis_sticker_opened",
    stickerSaveStarted: "gwapmojis_sticker_save_started",
    telegramClicked: "gwapmojis_telegram_clicked",
    howToOpened: "gwapmojis_howto_opened",
  });
});

test("an explicit source parameter wins over the referrer", () => {
  assert.equal(resolveGwapMojisSource("homepage", "/app"), "homepage");
  assert.equal(resolveGwapMojisSource("gwapos", "/"), "gwapos");
  assert.equal(resolveGwapMojisSource("GWAPOS", null), "gwapos");
});

test("the referrer path attributes homepage and GwapOS visits", () => {
  assert.equal(resolveGwapMojisSource(null, "/"), "homepage");
  assert.equal(resolveGwapMojisSource(null, "/app"), "gwapos");
  assert.equal(resolveGwapMojisSource(null, "/app/identity"), "gwapos");
});

test("unknown, missing and injected sources fall back to direct", () => {
  for (const value of [undefined, null, "", "  ", "referral", "<script>", "https://evil.example"]) {
    assert.equal(resolveGwapMojisSource(value, null), "direct");
  }
  assert.equal(resolveGwapMojisSource(null, "/ecosystem"), "direct");
});

test("device detection buckets iPhone, iPad, Android and desktop", () => {
  assert.equal(resolveGwapMojisDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari"), "ios");
  assert.equal(resolveGwapMojisDeviceType("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari"), "ios");
  assert.equal(resolveGwapMojisDeviceType("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Mobile/15E148"), "ios");
  assert.equal(resolveGwapMojisDeviceType("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126"), "android");
  assert.equal(resolveGwapMojisDeviceType("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari"), "desktop");
  assert.equal(resolveGwapMojisDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126"), "desktop");
  assert.equal(resolveGwapMojisDeviceType(undefined), "desktop");
});

test("each device gets usable, non-empty download instructions", () => {
  const ios = gwapMojisDownloadInstructions("ios");
  assert.equal(ios.title, "GwapMojis incoming.");
  assert.equal(ios.status, "Your GwapMode 33 pack is downloading.");
  assert.equal(ios.where, "On iPhone, find it in Files → Downloads.");

  const android = gwapMojisDownloadInstructions("android");
  assert.equal(android.status, "Your GwapMode 33 pack is downloading.");
  assert.equal(android.where, "Find it in Downloads.");

  const desktop = gwapMojisDownloadInstructions("desktop");
  assert.ok(desktop.where.length > 0);
  assert.notEqual(desktop.where, android.where);
});

test("a real Telegram sticker URL is accepted", () => {
  assert.equal(
    resolveGwapMojisTelegramUrl("https://t.me/addstickers/GwapMode33"),
    "https://t.me/addstickers/GwapMode33",
  );
  assert.equal(
    resolveGwapMojisTelegramUrl("  https://telegram.me/addstickers/GwapMode33  "),
    "https://telegram.me/addstickers/GwapMode33",
  );
});

test("a missing or non-Telegram URL hides the CTA instead of breaking it", () => {
  for (const value of [
    undefined,
    null,
    "",
    "   ",
    "not a url",
    "http://t.me/addstickers/GwapMode33",
    "https://t.me/GwapMode33",
    "https://example.com/addstickers/GwapMode33",
  ]) {
    assert.equal(resolveGwapMojisTelegramUrl(value), null);
  }
});
