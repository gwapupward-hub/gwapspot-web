// Lil Gwapz Reaction Pack 01 sticker cells for the GwapSpot homepage promo popup,
// built from the canonical lil-gwapz-stickers.generated.json (the same data the
// /lil-gwapz hub uses).

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

const COLORS = new Set<string>(["GRN", "ORG", "PUR", "RED"]);
const ATLASES = new Set<string>(LIL_GWAPZ_ATLAS_ORDER);

function toCell(reaction: CanonicalLilGwapzReaction, sex: LilGwapzSex): LilGwapzCell {
  const key = `${reaction.id}-${sex}`;
  const frame = sex === "M" ? reaction.male : reaction.female;
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

/** All 152 stickers, male then female per reaction. */
export function buildLilGwapzCells(reactions: readonly CanonicalLilGwapzReaction[]): LilGwapzCell[] {
  return reactions.flatMap((reaction) => [toCell(reaction, "M"), toCell(reaction, "F")]);
}
