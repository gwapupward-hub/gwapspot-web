import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const data = JSON.parse(fs.readFileSync(new URL("./lil-gwapz-stickers.generated.json", import.meta.url), "utf8"));

test("Lil Gwapz Reaction Pack 01 maps all 76 reactions and both character versions", () => {
  assert.equal(data.length, 76);
  assert.deepEqual(data.map((item) => item.id), Array.from({ length: 76 }, (_, index) => index + 1));
  for (const item of data) {
    assert.ok(item.reaction);
    assert.ok(item.male?.atlas);
    assert.ok(item.female?.atlas);
    assert.ok(item.male.col >= 0 && item.male.col < item.male.cols);
    assert.ok(item.female.col >= 0 && item.female.col < item.female.cols);
  }
});

test("Lil Gwapz atlas map yields exactly 152 unique sticker slots", () => {
  const slots = data.flatMap((item) => [
    `M:${item.male.atlas}:${item.male.col}:${item.male.row}`,
    `F:${item.female.atlas}:${item.female.col}:${item.female.row}`,
  ]);
  assert.equal(slots.length, 152);
  assert.equal(new Set(slots).size, 152);
});
