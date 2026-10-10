import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildLilGwapzCells,
  LIL_GWAPZ_ATLAS_URLS,
  LIL_GWAPZ_FRAME_CORRECTIONS,
  LIL_GWAPZ_SITE_URL,
  LIL_GWAPZ_TELEGRAM_BOT_URL,
} from "./lil-gwapz-stickers.ts";

const canonical = JSON.parse(fs.readFileSync(new URL("./lil-gwapz-stickers.generated.json", import.meta.url), "utf8"));
const hubSource = fs.readFileSync(new URL("../lil-gwapz/lil-gwapz-experience.tsx", import.meta.url), "utf8");
const popupSource = fs.readFileSync(new URL("../components/lil-gwapz-promo-popup.tsx", import.meta.url), "utf8");
const popupCss = fs.readFileSync(new URL("../components/lil-gwapz-promo-popup.module.css", import.meta.url), "utf8");

test("cells cover all 152 stickers with unique keys and unique atlas cells", () => {
  const cells = buildLilGwapzCells(canonical);
  assert.equal(cells.length, 152);
  assert.equal(new Set(cells.map((cell) => cell.key)).size, 152);
  assert.equal(new Set(cells.map((cell) => `${cell.atlas}:${cell.col}:${cell.row}`)).size, 152);
});

test("every art correction still replaces the frame the canonical data lists", () => {
  // When the canonical JSON is fixed, this fails: delete the matching correction.
  for (const [key, { canonical: expected }] of Object.entries(LIL_GWAPZ_FRAME_CORRECTIONS)) {
    const [id, sex] = key.split("-");
    const reaction = canonical.find((item) => item.id === Number(id));
    assert.ok(reaction, `reaction ${id} exists`);
    const frame = sex === "M" ? reaction.male : reaction.female;
    assert.deepEqual({ atlas: frame.atlas, col: frame.col, row: frame.row }, expected, `${key} canonical frame`);
  }
});

test("popup and hub use the same atlas artwork", () => {
  for (const url of Object.values(LIL_GWAPZ_ATLAS_URLS)) {
    assert.ok(hubSource.includes(url), `hub uses ${url}`);
  }
});

test("popup links to the official site and Telegram bot", () => {
  assert.equal(LIL_GWAPZ_SITE_URL, "https://lilgwapz.xyz");
  assert.equal(LIL_GWAPZ_TELEGRAM_BOT_URL, "https://t.me/ThaLilGwapz_bot");
  assert.ok(popupSource.includes("href={LIL_GWAPZ_SITE_URL}"));
  assert.ok(popupSource.includes("href={LIL_GWAPZ_TELEGRAM_BOT_URL}"));
});

test("popup display font is self-hosted with its license", () => {
  const match = popupCss.match(/url\("(\/brand\/lil-gwapz\/[^"]+\.woff2)"\)/);
  assert.ok(match, "popup CSS loads the display font from /brand/lil-gwapz/");
  assert.ok(fs.existsSync(new URL(`../../public${match[1]}`, import.meta.url)), `${match[1]} exists`);
  assert.ok(fs.existsSync(new URL("../../public/brand/lil-gwapz/OFL.txt", import.meta.url)), "OFL license ships with the font");
});
