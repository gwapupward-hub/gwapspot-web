import reactions from "./lil-gwapz-stickers.generated.json";
import assetData from "./lil-gwapz-assets.generated.json";
export type Character = "M" | "F";
export type CharacterFilter = "ALL" | Character;
export type StickerAsset = {
  filename: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  sourceArchiveMember: string;
};
export type Sticker = {
  key: string;
  id: number;
  reaction: string;
  color: string;
  emoji: string;
  keywords: string[];
  sex: Character;
  asset: StickerAsset;
};
const assets: Record<string, StickerAsset> = assetData;
export const characterName = (sex: Character) =>
  sex === "M" ? "Male" : "Female";
export const stickers: Sticker[] = reactions.flatMap((r) =>
  (["M", "F"] as const).map((sex) => {
    const key = "LG-R01-" + String(r.id).padStart(3, "0") + "-" + sex;
    return {
      key,
      id: r.id,
      reaction: r.reaction,
      color: r.color,
      emoji: r.emoji,
      keywords: r.keywords,
      sex,
      asset: assets[key],
    };
  }),
);
export const originalUrl = (s: Sticker) =>
  "/lil-gwapz/r01-v1/originals/" + s.asset.filename;
export const previewUrl = (s: Sticker, size: number) =>
  "/lil-gwapz/r01-v1/previews/" +
  s.asset.filename.replace(/\.png$/, "") +
  "-" +
  size +
  ".webp";
export const normalizeSearch = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’'.,!?\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function filterStickers(character: CharacterFilter, query: string) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  return stickers.filter(
    (s) =>
      (character === "ALL" || character === s.sex) &&
      terms.every((t) =>
        normalizeSearch(
          [s.reaction, s.emoji, s.key, s.color, ...s.keywords].join(" "),
        ).includes(t),
      ),
  );
}
export function pickSticker(id: number, sex: Character): Sticker {
  const result = stickers.find((s) => s.id === id && s.sex === sex);
  if (!result) throw new Error("Unknown sticker");
  return result;
}
