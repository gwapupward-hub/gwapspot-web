// Source-level guards for the GwapMojis distribution flow. They fail loudly if a
// future change reintroduces client-side ZIP assembly, gates the free pack
// behind a wallet, or breaks the first-tap download link.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GWAPMOJIS_PACK_FILENAME,
  GWAPMOJIS_PACK_STATIC_PATH,
} from "./gwapmojis-pack.ts";
import { GET, HEAD } from "../api/gwapmojis/download/[asset]/route.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../gwapmojis/page.tsx");
const experience = read("../gwapmojis/gwapmojis-experience.tsx");
const promo = read("../components/gwapmojis-promo.tsx");
const home = read("../page.tsx");
const dashboard = read("../app/components/dashboard-view.tsx");

test("/gwapmojis renders the campaign hierarchy and positioning", () => {
  assert.match(page, /export default function GwapMojisPage/);
  assert.match(page, /path: "\/gwapmojis"/);
  assert.match(experience, /GWAPMOJIS<\/span>/);
  assert.match(experience, /GWAPMODE 33<\/em>/);
  assert.match(experience, /YOUR REACTIONS NEED AN UPGRADE\./);
  assert.match(experience, /DOWNLOAD FREE PACK/);
  assert.match(experience, /33 original GWAP reactions\./);
  assert.match(experience, /No wallet required\./);
  assert.match(experience, /Works on iPhone • Android • Desktop/);
  assert.match(experience, /BROWSE GWAPMOJIS/);
});

test("the download CTA is a real anchor at the canonical file", () => {
  const cta = experience.match(/<a\s+className="gwapmojis-page-download"[\s\S]*?>/);
  assert.ok(cta, "the primary CTA must be an anchor, not a button");
  assert.match(cta[0], /href=\{packUrl\}/);
  assert.match(cta[0], /download=\{GWAPMOJIS_PACK_FILENAME\}/);
  assert.equal(GWAPMOJIS_PACK_STATIC_PATH, `/downloads/${GWAPMOJIS_PACK_FILENAME}`);
  assert.match(page, /resolveGwapMojisPackUrl\(process\.env\.NEXT_PUBLIC_GWAPMOJIS_PACK_URL\)/);
});

test("nothing cancels, defers or re-implements the native download", () => {
  // A preventDefault, Blob, object URL or client-side archive here is exactly
  // what broke the first tap on iOS Safari before this sprint.
  assert.doesNotMatch(experience, /\.preventDefault\(\)/);
  assert.doesNotMatch(experience, /createObjectURL|revokeObjectURL/);
  assert.doesNotMatch(experience, /jszip|fflate|pako|zip\.js/i);
  // The only Blob here is a tiny analytics beacon, never archive bytes.
  assert.doesNotMatch(experience, /new Blob\([^)]*(zip|sticker|pack)/i);
  assert.doesNotMatch(experience, /window\.location\.assign|router\.push/);
  // The failure probe must run after the browser already has the download.
  assert.match(experience, /probeRef/);
  assert.match(experience, /method: "HEAD"/);
});

test("the free pack requires no wallet, account, email or payment", () => {
  for (const source of [page, experience, promo]) {
    assert.doesNotMatch(source, /usePrivy|useWallet|useWalletHost|wallet-auth|requireAuth/);
    assert.doesNotMatch(source, /type="email"|<input/);
    assert.doesNotMatch(source, /checkout|stripe|price/i);
  }
});

test("the gallery lazy-loads optimized, labelled stickers", () => {
  assert.match(experience, /from "next\/image"/);
  assert.match(experience, /GWAPMOJIS_STICKERS\.map/);
  assert.match(experience, /loading=\{index < EAGER_STICKER_COUNT \? "eager" : "lazy"\}/);
  assert.match(experience, /alt=\{gwapMojisStickerAlt\(sticker\)\}/);
  assert.match(experience, /sizes=/);
  // Open full resolution, and save individually.
  assert.match(experience, /target="_blank"/);
  assert.match(experience, /download=\{sticker\.file\}/);
});

test("failure recovery offers retry, the direct file and the gallery without a modal", () => {
  assert.match(experience, /Download Again/);
  assert.match(experience, /Open the file directly/);
  assert.match(experience, /Back to the sticker gallery/);
  assert.match(experience, /How to use/);
  assert.doesNotMatch(experience, /createPortal|aria-modal/);
});

test("a missing Telegram URL renders no CTA at all", () => {
  assert.match(page, /resolveGwapMojisTelegramUrl\(/);
  assert.match(experience, /telegramUrl \? \(/);
  assert.match(experience, /ADD TO TELEGRAM/);
});

test("homepage and GwapOS share the one canonical destination", () => {
  assert.match(home, /<GwapMojisPromo surface="public_home"/);
  assert.match(dashboard, /<GwapMojisPromo surface="gwapos_home"/);
  assert.match(promo, /href=\{`\/gwapmojis\?source=\$\{source\}`\}/);
  assert.match(promo, /public_home: "homepage"/);
  assert.match(promo, /gwapos_home: "gwapos"/);
  // One module, one download implementation: the promo never downloads itself.
  assert.doesNotMatch(promo, /download=/);
  assert.doesNotMatch(promo, /\.zip/);
});

test("navigating to the campaign never disturbs wallet or auth state", () => {
  assert.doesNotMatch(promo, /usePrivy|useWallet|logout|disconnect/);
  // A plain link navigation, with no overlay or pointer choreography in the way.
  assert.doesNotMatch(promo, /createPortal|pointerUp|preventDefault|document\.body\.style/);
  assert.match(promo, /data-native-nav/);
});

test("legacy download endpoints redirect to the one canonical archive", async () => {
  for (const asset of ["complete", "static", "animated", "emoji"]) {
    const url = `https://www.gwapspot.com/api/gwapmojis/download/${asset}`;
    const response = await GET(new Request(url), { params: Promise.resolve({ asset }) });
    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get("location"),
      `https://www.gwapspot.com${GWAPMOJIS_PACK_STATIC_PATH}`,
    );
    const head = await HEAD(new Request(url, { method: "HEAD" }), { params: Promise.resolve({ asset }) });
    assert.equal(head.status, 308);
  }
});

test("unknown legacy assets and path injection 404 without redirecting", async () => {
  for (const asset of ["missing", "__proto__", "../complete", "https://example.com/archive.zip"]) {
    const response = await GET(
      new Request("https://www.gwapspot.com/api/gwapmojis/download/x"),
      { params: Promise.resolve({ asset }) },
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("location"), null);
  }
});

test("the ZIP is served as a real static file with attachment headers", () => {
  const config = read("../../next.config.ts");
  assert.match(config, /source: "\/downloads\/GwapMojis-GwapMode-33\.zip"/);
  assert.match(config, /key: "Content-Type", value: "application\/zip"/);
  assert.match(config, /attachment; filename="GwapMojis-GwapMode-33\.zip"/);
  // Nothing may rewrite or redirect the archive request into the app shell.
  const rewrites = config.slice(config.indexOf("async rewrites()"), config.indexOf("async headers()"));
  assert.doesNotMatch(rewrites, /downloads/);
  assert.doesNotMatch(rewrites, /gwapmojis/);
});

test("no intro overlay stands between a shared link and the first tap", () => {
  const layers = read("../components/public-experience-layers.tsx");
  const splash = read("../components/premium-splash.tsx");
  assert.match(layers, /pathname === "\/gwapmojis" \|\| pathname\.startsWith\("\/gwapmojis\/"\)/);
  assert.match(layers, /<PremiumSplash skipIntro=\{isCampaignLanding\} \/>/);
  assert.match(splash, /useState<OverlayMode>\(skipIntro \? null : "intro"\)/);
  assert.match(splash, /if \(skipIntro \|\| hasSeenIntro \|\| reducedMotion\)/);
  // A download link is exempt from the route-transition overlay too.
  assert.match(splash, /if \(anchor\.hasAttribute\("download"\)\) return;/);
});

test("mobile layout rules keep the campaign page inside the viewport", () => {
  const css = read("../gwapmojis-page.css");
  assert.match(css, /\.gwapmojis-page \{[\s\S]*?width: min\(1180px, calc\(100% - 40px\)\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 380px\)/);
  // Tap targets and focus states, with no hover-only affordances.
  assert.match(css, /min-height: 44px/);
  assert.match(css, /outline: 2px solid var\(--green\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
});
