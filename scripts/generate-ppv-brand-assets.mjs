#!/usr/bin/env node
/**
 * Generates the PPV receipt design assets as PNGs:
 *   public/brand/ppv/ppv-verified-seal.png       (512x512, transparent)
 *   public/brand/ppv/ppv-receipt-background.png  (1200x1600, opaque)
 *
 * These are deterministic, dependency-free renders so the receipt UI has real
 * assets to load. When the studio-supplied artwork lands, drop it at the same
 * paths and delete this script; the UI reads the files, not this generator.
 */
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "brand", "ppv");

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const GREEN = [19, 221, 19];
const INK = [5, 8, 6];

function blend(buffer, index, [r, g, b], alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  const inv = 1 - a;
  const oldA = buffer[index + 3] / 255;
  const outA = a + oldA * inv;
  if (outA <= 0) return;
  buffer[index] = Math.round((r * a + buffer[index] * oldA * inv) / outA);
  buffer[index + 1] = Math.round((g * a + buffer[index + 1] * oldA * inv) / outA);
  buffer[index + 2] = Math.round((b * a + buffer[index + 2] * oldA * inv) / outA);
  buffer[index + 3] = Math.round(outA * 255);
}

function seal() {
  const size = 512;
  const out = Buffer.alloc(size * size * 4, 0);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const i = (y * size + x) * 4;
      // Outer scalloped ring: 24 lobes.
      const lobes = 232 + 10 * Math.cos(angle * 24);
      if (d <= lobes) blend(out, i, INK, 0.92);
      if (d <= lobes && d >= lobes - 5) blend(out, i, GREEN, 0.9);
      // Inner rings.
      if (Math.abs(d - 196) <= 2.5) blend(out, i, GREEN, 0.85);
      if (Math.abs(d - 150) <= 1.5) blend(out, i, GREEN, 0.5);
      // Central disc with soft glow.
      if (d <= 118) blend(out, i, GREEN, 0.14 + 0.1 * (1 - d / 118));
      if (Math.abs(d - 118) <= 2) blend(out, i, GREEN, 0.95);
      // Tick marks around the middle band (60 ticks).
      const tick = Math.abs(((angle + Math.PI) % (Math.PI / 30)) - Math.PI / 60) < 0.012;
      if (tick && d > 158 && d < 186) blend(out, i, GREEN, 0.7);
      // Checkmark inside the disc: two strokes.
      const onStroke = (x1, y1, x2, y2, w) => {
        const vx = x2 - x1; const vy = y2 - y1; const len2 = vx * vx + vy * vy;
        const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / len2));
        return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy)) <= w;
      };
      if (onStroke(190, 262, 238, 310, 16) || onStroke(238, 310, 330, 208, 16)) blend(out, i, GREEN, 1);
    }
  }
  return png(size, size, out);
}

function background() {
  const width = 1200;
  const height = 1600;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const t = y / height;
      out[i] = Math.round(8 + 8 * (1 - t));
      out[i + 1] = Math.round(14 + 10 * (1 - t));
      out[i + 2] = Math.round(10 + 6 * (1 - t));
      out[i + 3] = 255;
      // Fine guilloche-style grid.
      if ((x % 40 === 0 || y % 40 === 0) && x > 60 && x < width - 60 && y > 60 && y < height - 60) blend(out, i, GREEN, 0.05);
      // Perforated edge (receipt tear) top and bottom.
      const perf = (x % 36) < 18;
      if ((y < 14 || y >= height - 14) && perf) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; }
      // Frame.
      const inset = 44;
      const onFrame =
        (Math.abs(x - inset) <= 2 || Math.abs(x - (width - inset)) <= 2) && y >= inset && y <= height - inset ||
        (Math.abs(y - inset) <= 2 || Math.abs(y - (height - inset)) <= 2) && x >= inset && x <= width - inset;
      if (onFrame) blend(out, i, GREEN, 0.55);
      // Corner glow top-right.
      const glow = Math.hypot(x - width + 120, y - 120);
      if (glow < 420) blend(out, i, GREEN, 0.12 * (1 - glow / 420));
      // Watermark ring bottom-right (mirrors the seal).
      const ring = Math.hypot(x - (width - 260), y - (height - 300));
      if (Math.abs(ring - 190) <= 2 || Math.abs(ring - 150) <= 1) blend(out, i, GREEN, 0.18);
    }
  }
  return png(width, height, out);
}

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "ppv-verified-seal.png"), seal());
await writeFile(path.join(outDir, "ppv-receipt-background.png"), background());
console.log("Generated public/brand/ppv/ppv-verified-seal.png and ppv-receipt-background.png");
