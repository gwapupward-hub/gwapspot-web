import assert from "node:assert/strict";
import test from "node:test";
import { GWAPMOJIS_CAMPAIGN, GWAPMOJIS_TELEGRAM_PACK_URL } from "./gwapmojis-campaign.ts";
import {
  GWAPMOJIS_GUIDES,
  gwapMojisGuideDomId,
  gwapMojisHowToCtaLabel,
  gwapMojisLeadPlatform,
  orderGwapMojisGuides,
} from "./gwapmojis-howto.ts";

const guide = (id) => GWAPMOJIS_GUIDES.find((item) => item.id === id);

test("all three platform guides exist with usable content", () => {
  assert.deepEqual(GWAPMOJIS_GUIDES.map((item) => item.id), ["ios", "android", "telegram"]);
  for (const item of GWAPMOJIS_GUIDES) {
    assert.ok(item.label.length > 0, item.id);
    assert.ok(item.headline.length > 0, item.id);
    assert.ok(item.summary.length > 0, item.id);
    assert.ok(item.sections.length > 0, item.id);
    for (const section of item.sections) {
      assert.ok(section.heading.length > 0, `${item.id}/${section.heading}`);
      assert.ok(section.steps.length > 0, `${item.id}/${section.heading}`);
      // Duplicate step text would collide as a React key.
      assert.equal(new Set(section.steps).size, section.steps.length, `${item.id}/${section.heading}`);
    }
    assert.equal(new Set(item.sections.map((s) => s.heading)).size, item.sections.length, item.id);
  }
});

test("the iPhone guide covers Photos, the sticker path and a plain send", () => {
  const ios = guide("ios");
  assert.match(ios.headline, /IMESSAGE/);
  const text = JSON.stringify(ios);
  assert.match(text, /Photos/);
  assert.match(text, /Add Sticker/);
  assert.match(text, /Messages/);
  // The straightforward alternative must be present, not just the sticker path.
  assert.ok(ios.sections.some((section) => /send it right now/i.test(section.heading)));
});

test("the iPhone guide is honest about Add Sticker and about WebP in Photos", () => {
  const ios = guide("ios");
  const notes = ios.sections.map((section) => section.note ?? "").join(" ");
  // Never promise subject lift on every image or device.
  assert.match(notes, /only when iOS can lift the subject/i);
  assert.match(notes, /not offered for every image/i);
  // Explain why Save (PNG) is the route, not the WebP inside the ZIP.
  assert.match(notes, /WebP/);
  assert.match(notes, /Photos cannot import/i);
});

test("the Android guide offers a plain send and a clearly conditional Photomoji", () => {
  const android = guide("android");
  assert.match(android.headline, /GOOGLE MESSAGES/);
  assert.ok(android.sections.some((section) => /send as a picture/i.test(section.heading)));
  const photomoji = android.sections.find((section) => /photomoji/i.test(section.heading));
  assert.ok(photomoji, "a Photomoji section must exist");
  assert.match(photomoji.note ?? "", /supported versions of Google Messages/i);
  assert.match(photomoji.note ?? "", /not on every device/i);
});

test("Telegram leads with the official pack, not a manual rebuild", () => {
  const telegram = guide("telegram");
  assert.equal(telegram.cta.href, GWAPMOJIS_TELEGRAM_PACK_URL);
  assert.equal(telegram.cta.href, "https://t.me/addstickers/GwapMode33");
  assert.match(telegram.cta.label, /ADD GWAPMODE 33 TO TELEGRAM/);
  // The pack comes first; the @Stickers bot route is the secondary note.
  assert.match(telegram.sections[0].heading, /add the pack/i);
  const manual = telegram.sections.find((section) => /already downloaded/i.test(section.heading));
  assert.ok(manual, "the manual alternative must still be offered");
  assert.match(manual.note ?? "", /long way round/i);
});

test("Telegram Premium is stated without gating the free download", () => {
  const note = guide("telegram").cta.note;
  assert.match(note, /Telegram Premium/);
  // Telegram, not GwapSpot, decides eligibility.
  assert.match(note, /Telegram decides/i);
  // The universal download must not read as Premium-gated.
  assert.match(note, /free/i);
});

test("the Telegram pack URL is centralized, never duplicated", () => {
  assert.equal(GWAPMOJIS_TELEGRAM_PACK_URL, "https://t.me/addstickers/GwapMode33");
  assert.equal(GWAPMOJIS_CAMPAIGN.telegramUrl, GWAPMOJIS_TELEGRAM_PACK_URL);
  assert.equal(guide("telegram").cta.href, GWAPMOJIS_TELEGRAM_PACK_URL);
});

test("device detection reorders the guides and never removes one", () => {
  for (const device of ["ios", "android", "desktop"]) {
    const ordered = orderGwapMojisGuides(device);
    assert.equal(ordered.length, GWAPMOJIS_GUIDES.length, device);
    assert.deepEqual(
      [...ordered.map((item) => item.id)].sort(),
      ["android", "ios", "telegram"],
      `${device} must keep every guide reachable`,
    );
  }

  assert.equal(orderGwapMojisGuides("ios")[0].id, "ios");
  assert.equal(orderGwapMojisGuides("android")[0].id, "android");
  // An unknown device gets the untouched order, not a truncated list.
  assert.deepEqual(orderGwapMojisGuides("desktop"), GWAPMOJIS_GUIDES);
});

test("the download-success shortcut targets the right guide and label", () => {
  assert.equal(gwapMojisLeadPlatform("ios"), "ios");
  assert.equal(gwapMojisLeadPlatform("android"), "android");
  assert.equal(gwapMojisLeadPlatform("desktop"), "telegram");

  assert.equal(gwapMojisHowToCtaLabel("ios"), "HOW TO ADD THEM TO IMESSAGE");
  assert.equal(gwapMojisHowToCtaLabel("android"), "HOW TO USE THEM IN MESSAGES");
  assert.equal(gwapMojisHowToCtaLabel("desktop"), "HOW TO USE GWAPMOJIS");
});

test("guide dom ids are unique and stable", () => {
  const ids = GWAPMOJIS_GUIDES.map((item) => gwapMojisGuideDomId(item.id));
  assert.deepEqual(ids, [
    "gwapmojis-guide-ios",
    "gwapmojis-guide-android",
    "gwapmojis-guide-telegram",
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test("no guide claims the website installs anything itself", () => {
  const text = JSON.stringify(GWAPMOJIS_GUIDES).toLowerCase();
  for (const claim of [
    "we install",
    "installs automatically",
    "automatically added",
    "added to your keyboard for you",
  ]) {
    assert.ok(!text.includes(claim), `must not claim: ${claim}`);
  }
});
