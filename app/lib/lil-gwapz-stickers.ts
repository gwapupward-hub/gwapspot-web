// Lil Gwapz Reaction Pack 01 sticker cells, shared by the lilgwapz.xyz splash
// (public/lilgwapz/index.html embeds the output of buildLilGwapzCells) and the
// GwapSpot homepage promo popup.
//
// Built from the canonical lil-gwapz-stickers.generated.json. A few canonical
// frames point at artwork for a different sticker; the correction table below
// maps those keys to the cell that actually holds their art (checked visually
// against all four atlases). The canonical JSON itself is left untouched.

export type LilGwapzAtlasId = "male-a" | "male-b" | "female-a" | "female-b";
export type LilGwapzSex = "M" | "F";
export type LilGwapzColor = "GRN" | "ORG" | "PUR" | "RED";

type CanonicalFrame = { atlas: string; col: number; row: number };

export type CanonicalLilGwapzReaction = {
  id: number;
  reaction: string;
  color: string;
  emoji: string;
  male: CanonicalFrame;
  female: CanonicalFrame;
};

export type LilGwapzCell = {
  /** `${id}-${sex}`, unique across the 152 stickers. */
  key: string;
  id: number;
  reaction: string;
  color: LilGwapzColor;
  emoji: string;
  sex: LilGwapzSex;
  atlas: LilGwapzAtlasId;
  col: number;
  row: number;
};

/** Each atlas is an 8 × 5 grid of 192px cells. */
export const LIL_GWAPZ_CELL_PX = 192;
export const LIL_GWAPZ_ATLAS_COLS = 8;
export const LIL_GWAPZ_ATLAS_ROWS = 5;

export const LIL_GWAPZ_ATLAS_ORDER: readonly LilGwapzAtlasId[] = ["male-a", "male-b", "female-a", "female-b"];

export const LIL_GWAPZ_ATLAS_URLS: Readonly<Record<LilGwapzAtlasId, string>> = {
  "male-a": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405790/lil-gwapz/reaction-pack-01/atlas/male-a.webp",
  "male-b": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405800/lil-gwapz/reaction-pack-01/atlas/male-b.webp",
  "female-a": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405811/lil-gwapz/reaction-pack-01/atlas/female-a.webp",
  "female-b": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405820/lil-gwapz/reaction-pack-01/atlas/female-b.webp",
};

export const LIL_GWAPZ_SITE_URL = "https://lilgwapz.xyz";
export const LIL_GWAPZ_TELEGRAM_BOT_URL = "https://t.me/ThaLilGwapz_bot";
export const LIL_GWAPZ_HUB_URL = "https://www.gwapspot.com/lil-gwapz";

type CellFrame = { atlas: LilGwapzAtlasId; col: number; row: number };

/**
 * Canonical frames whose artwork belongs to another sticker, keyed `${id}-${sex}`.
 * `canonical` is the frame the generated JSON lists today; `actual` is the cell
 * that holds the right art. Tests fail if the canonical data changes, so this
 * table is removed once the source data is fixed.
 */
export const LIL_GWAPZ_FRAME_CORRECTIONS: Readonly<Record<string, { canonical: CellFrame; actual: CellFrame }>> = {
  // Heart Eyes (female) and Blowing a Kiss (male) point at each other's art.
  "11-F": { canonical: { atlas: "female-a", col: 2, row: 1 }, actual: { atlas: "male-a", col: 3, row: 1 } },
  "12-M": { canonical: { atlas: "male-a", col: 3, row: 1 }, actual: { atlas: "female-a", col: 2, row: 1 } },
  // Much Love and Miss You have their male and female cells swapped.
  "13-M": { canonical: { atlas: "male-a", col: 4, row: 1 }, actual: { atlas: "female-a", col: 4, row: 1 } },
  "13-F": { canonical: { atlas: "female-a", col: 4, row: 1 }, actual: { atlas: "male-a", col: 4, row: 1 } },
  "14-M": { canonical: { atlas: "male-a", col: 5, row: 1 }, actual: { atlas: "female-a", col: 5, row: 1 } },
  "14-F": { canonical: { atlas: "female-a", col: 5, row: 1 }, actual: { atlas: "male-a", col: 5, row: 1 } },
};

const COLORS = new Set<string>(["GRN", "ORG", "PUR", "RED"]);
const ATLASES = new Set<string>(LIL_GWAPZ_ATLAS_ORDER);

function toCell(reaction: CanonicalLilGwapzReaction, sex: LilGwapzSex): LilGwapzCell {
  const key = `${reaction.id}-${sex}`;
  const canonical = sex === "M" ? reaction.male : reaction.female;
  const frame = LIL_GWAPZ_FRAME_CORRECTIONS[key]?.actual ?? canonical;
  if (!ATLASES.has(frame.atlas)) throw new Error(`Unknown Lil Gwapz atlas "${frame.atlas}" for ${key}`);
  if (!COLORS.has(reaction.color)) throw new Error(`Unknown Lil Gwapz color "${reaction.color}" for ${key}`);
  return {
    key,
    id: reaction.id,
    reaction: reaction.reaction,
    color: reaction.color as LilGwapzColor,
    emoji: reaction.emoji,
    sex,
    atlas: frame.atlas as LilGwapzAtlasId,
    col: frame.col,
    row: frame.row,
  };
}

/** All 152 stickers (male then female per reaction), with art corrections applied. */
export function buildLilGwapzCells(reactions: readonly CanonicalLilGwapzReaction[]): LilGwapzCell[] {
  return reactions.flatMap((reaction) => [toCell(reaction, "M"), toCell(reaction, "F")]);
}

/**
 * Compact form embedded in the static splash page:
 * `[key, id, reaction, color, emoji, atlasIndex, col, row]`, where atlasIndex
 * indexes LIL_GWAPZ_ATLAS_ORDER.
 */
export type LilGwapzSplashCell = [string, number, string, LilGwapzColor, string, number, number, number];

export function toLilGwapzSplashData(cells: readonly LilGwapzCell[]) {
  return {
    atlases: LIL_GWAPZ_ATLAS_ORDER.map((atlas) => LIL_GWAPZ_ATLAS_URLS[atlas]),
    cells: cells.map((cell): LilGwapzSplashCell => [
      cell.key,
      cell.id,
      cell.reaction,
      cell.color,
      cell.emoji,
      LIL_GWAPZ_ATLAS_ORDER.indexOf(cell.atlas),
      cell.col,
      cell.row,
    ]),
  };
}
