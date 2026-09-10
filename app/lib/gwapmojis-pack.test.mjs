// The GwapMojis pack must be a real, committed, valid archive — not something
// assembled at runtime. These tests read the actual files in `public/`.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  GWAPMOJIS_PACK_BYTES,
  GWAPMOJIS_PACK_FILENAME,
  GWAPMOJIS_PACK_SHA256,
  GWAPMOJIS_PACK_STATIC_PATH,
  GWAPMOJIS_STICKERS,
  GWAPMOJIS_STICKER_BASE_PATH,
  gwapMojisStickerAlt,
  gwapMojisStickerUrl,
  resolveGwapMojisPackUrl,
} from "./gwapmojis-pack.ts";

const publicPath = (path) => fileURLToPath(new URL(`../../public${path}`, import.meta.url));
const packPath = publicPath(GWAPMOJIS_PACK_STATIC_PATH);

test("the pack is served from a static public path, not an API route", () => {
  assert.equal(GWAPMOJIS_PACK_FILENAME, "GwapMojis-GwapMode-33.zip");
  assert.equal(GWAPMOJIS_PACK_STATIC_PATH, "/downloads/GwapMojis-GwapMode-33.zip");
});

test("the committed archive matches the canonical pack byte for byte", () => {
  const bytes = readFileSync(packPath);
  assert.equal(statSync(packPath).size, GWAPMOJIS_PACK_BYTES);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), GWAPMOJIS_PACK_SHA256);
  // Local ZIP file header, so a rewritten HTML shell can never pass as the pack.
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

/**
 * Walk the ZIP central directory. Reading the archive's own index (rather than
 * shelling out to `unzip`) keeps this test portable and proves the file really
 * is a well-formed archive.
 */
function listZipEntries(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  assert.notEqual(end, -1, "no end-of-central-directory record");

  const total = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const names = [];

  for (let index = 0; index < total; index += 1) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, `bad central directory entry ${index}`);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    names.push(bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return names;
}

test("the archive is a valid ZIP holding exactly the 33 declared stickers", () => {
  const listing = listZipEntries(readFileSync(packPath));
  const stickerEntries = listing.filter((entry) => entry.endsWith(".webp")).sort();
  const expected = GWAPMOJIS_STICKERS
    .map((sticker) => `GwapMojis_GwapMode33_Telegram_Static_33/stickers/${sticker.file}`)
    .sort();

  assert.equal(GWAPMOJIS_STICKERS.length, 33);
  assert.deepEqual(stickerEntries, expected);
});

test("every gallery sticker exists on disk with the declared size and dimensions", () => {
  for (const sticker of GWAPMOJIS_STICKERS) {
    const path = publicPath(`${GWAPMOJIS_STICKER_BASE_PATH}/${sticker.file}`);
    assert.equal(statSync(path).size, sticker.bytes, sticker.file);
    assert.equal(sticker.width, 512);
    assert.equal(sticker.height, 512);
    assert.equal(readFileSync(path).subarray(8, 12).toString("ascii"), "WEBP", sticker.file);
  }
});

test("sticker ids, orders and emoji are unique and stable", () => {
  const ids = GWAPMOJIS_STICKERS.map((sticker) => sticker.id);
  const orders = GWAPMOJIS_STICKERS.map((sticker) => sticker.order);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(orders, Array.from({ length: 33 }, (_, index) => index + 1));
  for (const sticker of GWAPMOJIS_STICKERS) {
    assert.ok(sticker.name.length > 0, sticker.id);
    assert.ok(sticker.emoji.length > 0, sticker.id);
    assert.equal(gwapMojisStickerUrl(sticker), `/gwapmojis/stickers/${sticker.file}`);
    assert.match(gwapMojisStickerAlt(sticker), /^GwapMojis GwapMode 33 sticker: /);
  }
});

test("an unset, empty or unusable pack override falls back to the static archive", () => {
  for (const override of [undefined, null, "", "   ", "not a url", "http://insecure.example/pack.zip", "javascript:alert(1)"]) {
    assert.equal(resolveGwapMojisPackUrl(override), GWAPMOJIS_PACK_STATIC_PATH);
  }
});

test("a configured https or same-origin override is used verbatim", () => {
  assert.equal(
    resolveGwapMojisPackUrl("https://cdn.example.com/GwapMojis-GwapMode-33.zip"),
    "https://cdn.example.com/GwapMojis-GwapMode-33.zip",
  );
  assert.equal(resolveGwapMojisPackUrl("/static/pack.zip"), "/static/pack.zip");
});
