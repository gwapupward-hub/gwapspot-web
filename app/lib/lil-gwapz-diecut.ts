// Browser-only: renders a Lil Gwapz sticker cell as a die-cut vinyl sticker
// (white cut border hugging the character, plus a gloss sheen) and returns an
// object URL for an <img>. Same treatment as the lilgwapz.xyz splash page.

import {
  LIL_GWAPZ_ATLAS_URLS,
  LIL_GWAPZ_CELL_PX,
  type LilGwapzAtlasId,
  type LilGwapzCell,
} from "./lil-gwapz-stickers";

export type LilGwapzDieCut = { src: string; width: number; height: number };

const SCALE = 2; // render at 2x for sharp edges on retina screens
const BORDER = 7; // cut border in CSS px
const PAPER = "#fffdf8";

const atlasJobs = new Map<LilGwapzAtlasId, Promise<HTMLImageElement>>();
const cutJobs = new Map<string, Promise<LilGwapzDieCut>>();

export function loadLilGwapzAtlas(atlas: LilGwapzAtlasId): Promise<HTMLImageElement> {
  let job = atlasJobs.get(atlas);
  if (!job) {
    job = new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => {
        atlasJobs.delete(atlas);
        reject(new Error("Lil Gwapz artwork could not load."));
      };
      image.src = LIL_GWAPZ_ATLAS_URLS[atlas];
    });
    atlasJobs.set(atlas, job);
  }
  return job;
}

function render(image: HTMLImageElement, cell: LilGwapzCell): Promise<LilGwapzDieCut> {
  const cellPx = LIL_GWAPZ_CELL_PX;
  const size = cellPx * SCALE;
  const art = document.createElement("canvas");
  art.width = size;
  art.height = size;
  const a = art.getContext("2d", { willReadFrequently: true });
  if (!a) throw new Error("Canvas is unavailable.");
  a.imageSmoothingEnabled = true;
  a.imageSmoothingQuality = "high";
  a.drawImage(image, cell.col * cellPx, cell.row * cellPx, cellPx, cellPx, 0, 0, size, size);

  // Trim to the character so the sticker hugs the art.
  const px = a.getImageData(0, 0, size, size).data;
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (px[(y * size + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("Empty sticker cell.");

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const r = BORDER * SCALE;
  const pad = r + 2 * SCALE;
  const out = document.createElement("canvas");
  out.width = bw + pad * 2;
  out.height = bh + pad * 2;
  const o = out.getContext("2d");
  if (!o) throw new Error("Canvas is unavailable.");

  // Cut border: stamp the silhouette around rings, then paint it paper white.
  for (const ring of [1, 0.66, 0.33]) {
    for (let i = 0; i < 28; i += 1) {
      const t = (i / 28) * Math.PI * 2;
      o.drawImage(art, x0, y0, bw, bh, pad + Math.cos(t) * r * ring, pad + Math.sin(t) * r * ring, bw, bh);
    }
  }
  o.globalCompositeOperation = "source-in";
  o.fillStyle = PAPER;
  o.fillRect(0, 0, out.width, out.height);
  o.globalCompositeOperation = "source-over";
  o.drawImage(art, x0, y0, bw, bh, pad, pad, bw, bh);

  // Vinyl gloss: soft sheen with a crisp glare edge.
  o.globalCompositeOperation = "source-atop";
  const sheen = o.createLinearGradient(0, 0, out.width * 0.8, out.height * 0.8);
  sheen.addColorStop(0, "rgba(255,255,255,0.32)");
  sheen.addColorStop(0.34, "rgba(255,255,255,0.08)");
  sheen.addColorStop(0.35, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  o.fillStyle = sheen;
  o.fillRect(0, 0, out.width, out.height);

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Sticker could not render."));
        return;
      }
      resolve({ src: URL.createObjectURL(blob), width: out.width / SCALE, height: out.height / SCALE });
    }, "image/png");
  });
}

/** Cached per sticker; rejects if the artwork cannot load or render. */
export function lilGwapzDieCut(cell: LilGwapzCell): Promise<LilGwapzDieCut> {
  let job = cutJobs.get(cell.key);
  if (!job) {
    job = loadLilGwapzAtlas(cell.atlas).then((image) => render(image, cell));
    job.catch(() => cutJobs.delete(cell.key));
    cutJobs.set(cell.key, job);
  }
  return job;
}
