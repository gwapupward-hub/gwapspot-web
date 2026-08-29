// One-off generator for the GwapOS wallet app icon derivatives.
//
// Sources (canonical assets):
//   - transparent crowned "G"  -> internal/loading symbol + maskable source
//   - finished black tile        -> installed-app / favicon / apple-touch source
//
// Run: node scripts/generate-gwapos-icons.mjs <transparentPng> <blackTilePng>
// Output: public/gwapos/icons/v1/*
//
// Re-runnable and deterministic. Not part of the build; kept for reproducibility.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "gwapos", "icons", "v1");

const [, , transparentArg, blackTileArg] = process.argv;
if (!transparentArg || !blackTileArg) {
  console.error(
    "Usage: node scripts/generate-gwapos-icons.mjs <transparentPng> <blackTilePng>",
  );
  process.exit(1);
}

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

async function main() {
  await mkdir(outDir, { recursive: true });

  const transparent = await sharp(transparentArg)
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const blackTile = await sharp(blackTileArg)
    .resize(1024, 1024, { fit: "contain", background: BLACK })
    .png()
    .toBuffer();

  // Canonical 1024s.
  await write("gwapos-icon-transparent-1024.png", transparent);
  await write("gwapos-icon-1024.png", await flattenOnBlack(blackTile, 1024));

  // Right-sized transparent symbols for in-app UI/loading states (avoid shipping
  // the 1024 master to a ~96px element).
  for (const size of [256, 96]) {
    const buf = await sharp(transparent)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    await write(`gwapos-icon-transparent-${size}.png`, buf);
  }

  // Full-bleed "any"/tile PNGs derived from the finished black tile.
  const tileSizes = [512, 192, 180, 96, 64, 48, 32, 16];
  for (const size of tileSizes) {
    const buf = await sharp(blackTile)
      .resize(size, size, { fit: "contain", background: BLACK })
      .flatten({ background: BLACK })
      .png()
      .toBuffer();
    await write(`gwapos-icon-${size}.png`, buf);
  }

  // Maskable icon: transparent crowned G centered on a solid black square with a
  // generous safe zone (content ~72% of canvas) so no crown/G edge is clipped by
  // circular/squircle masks.
  await write("gwapos-icon-512-maskable.png", await buildMaskable(transparent, 512));
  await write("gwapos-icon-192-maskable.png", await buildMaskable(transparent, 192));

  // Small-size legibility: at <=32px, reduce glow bleed by trimming transparent
  // padding on the symbol and compositing tighter on black so the neon-green
  // silhouette stays dominant. Geometry is unchanged (same source logo).
  for (const size of [32, 16]) {
    await write(`gwapos-icon-${size}.png`, await buildSmallLegible(transparent, size));
  }

  // SVG wrappers embed a modestly sized raster so they stay light enough for
  // favicon/tab and scalable-UI use (a true vector master was not supplied).
  const transparent512 = await sharp(transparent)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
  const tile256 = await sharp(blackTile)
    .resize(256, 256, { fit: "contain", background: BLACK })
    .flatten({ background: BLACK })
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
  await write("gwapos-icon.svg", buildSvg(transparent512, 512));
  await write("gwapos-icon-tile.svg", buildTileSvg(tile256, 256));

  console.log("GwapOS icon derivatives written to", path.relative(root, outDir));
}

async function flattenOnBlack(buffer, size) {
  return sharp(buffer)
    .resize(size, size, { fit: "contain", background: BLACK })
    .flatten({ background: BLACK })
    .png()
    .toBuffer();
}

async function buildMaskable(transparentBuffer, size) {
  const content = Math.round(size * 0.72);
  const symbol = await sharp(transparentBuffer)
    .trim()
    .resize(content, content, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BLACK,
    },
  })
    .composite([{ input: symbol, gravity: "center" }])
    .png()
    .toBuffer();
}

async function buildSmallLegible(transparentBuffer, size) {
  // Trim the glow halo, then place the symbol at ~86% on black for a crisp,
  // dominant silhouette at favicon sizes.
  const content = Math.round(size * 0.86);
  const symbol = await sharp(transparentBuffer)
    .trim()
    .resize(content, content, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BLACK },
  })
    .composite([{ input: symbol, gravity: "center" }])
    .flatten({ background: BLACK })
    .png()
    .toBuffer();
}

function buildSvg(pngBuffer, dim) {
  const b64 = pngBuffer.toString("base64");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="GwapOS">
  <image width="${dim}" height="${dim}" href="data:image/png;base64,${b64}"/>
</svg>
`;
}

function buildTileSvg(pngBuffer, dim) {
  const b64 = pngBuffer.toString("base64");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="GwapOS">
  <image width="${dim}" height="${dim}" href="data:image/png;base64,${b64}"/>
</svg>
`;
}

async function write(name, buffer) {
  const target = path.join(outDir, name);
  await writeFile(target, buffer);
  const { size } = await sharp(buffer).metadata().catch(() => ({ size: undefined }));
  void size;
  console.log("wrote", name, `${buffer.length} bytes`);
}

await main();
