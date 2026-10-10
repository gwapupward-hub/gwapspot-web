import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildLilGwapzCells,
  LIL_GWAPZ_ATLAS_URLS,
  LIL_GWAPZ_FRAME_CORRECTIONS,
  LIL_GWAPZ_HUB_URL,
  LIL_GWAPZ_TELEGRAM_BOT_URL,
  toLilGwapzSplashData,
} from "./lil-gwapz-stickers.ts";

const canonical = JSON.parse(fs.readFileSync(new URL("./lil-gwapz-stickers.generated.json", import.meta.url), "utf8"));
const splashHtml = fs.readFileSync(new URL("../../public/lilgwapz/index.html", import.meta.url), "utf8");
const hubSource = fs.readFileSync(new URL("../lil-gwapz/lil-gwapz-experience.tsx", import.meta.url), "utf8");

function embeddedSplashData() {
  const match = splashHtml.match(/<script type="application\/json" id="lg-data">([\s\S]*?)<\/script>/);
  assert.ok(match, "splash page embeds its sticker data");
  return JSON.parse(match[1]);
}

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

test("the splash page embeds exactly the corrected sticker data", () => {
  assert.deepEqual(embeddedSplashData(), toLilGwapzSplashData(buildLilGwapzCells(canonical)));
});

test("splash and hub use the same atlas artwork", () => {
  for (const url of Object.values(LIL_GWAPZ_ATLAS_URLS)) {
    assert.ok(hubSource.includes(url), `hub uses ${url}`);
  }
});

test("splash links to the official bot and the hub, and its assets exist", () => {
  assert.ok(splashHtml.includes(`href="${LIL_GWAPZ_TELEGRAM_BOT_URL}"`));
  assert.ok(splashHtml.includes(`href="${LIL_GWAPZ_HUB_URL}"`));
  const assets = [...splashHtml.matchAll(/(?:href|src|content)="(?:https:\/\/lilgwapz\.xyz)?(\/lilgwapz\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(assets.length >= 4, "references its own assets");
  for (const asset of new Set(assets)) {
    assert.ok(fs.existsSync(new URL(`../../public${asset}`, import.meta.url)), `${asset} exists`);
  }
});
