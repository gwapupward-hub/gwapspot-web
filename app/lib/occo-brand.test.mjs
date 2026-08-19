import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("OCCO surfaces use the locked official transparent master", () => {
  const ecosystem = read("./ecosystem.ts");
  const brandCss = read("../brand-assets.css");
  const official = read("../../public/logos/occo-official.svg");
  const canonical = read("../../public/brand/occo/OCCO_Official_Master.svg");
  const clearAlias = read("../../public/logos/occo-clear.svg");

  assert.match(ecosystem, /logo: "\/logos\/occo-official\.svg"/);
  assert.match(
    brandCss,
    /data-gwap-product="occo"[^\n]+background-image: url\("\/logos\/occo-official\.svg"\)/,
  );

  for (const svg of [official, canonical, clearAlias]) {
    assert.match(svg, /viewBox="0 0 755 239"/);
    assert.match(svg, /#008AFE/);
    assert.match(svg, /#0064FC/);
    assert.match(svg, /#003BF4/);
    assert.doesNotMatch(svg, /<rect[^>]+fill=["']#000/i);
    assert.doesNotMatch(svg, /<image\b/i);
  }

  assert.equal(official, canonical);
  assert.equal(clearAlias, canonical);
});
