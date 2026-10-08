import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import test from "node:test";
import sharp from "sharp";
const assets = JSON.parse(
  fs.readFileSync(
    new URL("./lil-gwapz-assets.generated.json", import.meta.url),
    "utf8",
  ),
);
const reactions = JSON.parse(
  fs.readFileSync(
    new URL("./lil-gwapz-stickers.generated.json", import.meta.url),
    "utf8",
  ),
);
const root = new URL("../../public/lil-gwapz/r01-v1/", import.meta.url);
test("Every reaction has two unique, native-resolution, unchanged transparent PNG originals", async () => {
  assert.equal(Object.keys(assets).length, 152);
  const hashes = new Set();
  for (const reaction of reactions)
    for (const sex of ["M", "F"]) {
      const key = `LG-R01-${String(reaction.id).padStart(3, "0")}-${sex}`;
      const asset = assets[key];
      assert.ok(asset, key);
      assert.ok(asset.filename.startsWith(key), key);
      const buffer = fs.readFileSync(
        new URL("originals/" + asset.filename, root),
      );
      assert.equal(buffer.length, asset.bytes, key);
      assert.equal(
        crypto.createHash("sha256").update(buffer).digest("hex"),
        asset.sha256,
        key,
      );
      hashes.add(asset.sha256);
      const info = await sharp(buffer).metadata();
      assert.equal(info.format, "png", key);
      assert.equal(info.width, 1254, key);
      assert.equal(info.height, 1254, key);
      assert.equal(info.hasAlpha, true, key);
    }
  assert.equal(hashes.size, 152);
});
test("Every sticker has three native-or-smaller responsive previews with alpha", async () => {
  for (const [key, asset] of Object.entries(assets))
    for (const size of [384, 768, 1254]) {
      const filename = asset.filename.replace(/\.png$/, `-${size}.webp`);
      const info = await sharp(
        fs.readFileSync(new URL("previews/" + filename, root)),
      ).metadata();
      assert.equal(info.format, "webp", key);
      assert.equal(info.width, size, key);
      assert.equal(info.height, size, key);
      assert.equal(info.hasAlpha, true, key);
    }
});
test("Six verified archive label swaps retain the correct source provenance", () => {
  const corrections = {
    "011-F": "012-M",
    "012-M": "011-F",
    "013-M": "013-F",
    "013-F": "013-M",
    "014-M": "014-F",
    "014-F": "014-M",
  };
  for (const [target, source] of Object.entries(corrections))
    assert.ok(
      assets["LG-R01-" + target].sourceArchiveMember.includes(
        "LG-R01-" + source,
      ),
      target,
    );
});
