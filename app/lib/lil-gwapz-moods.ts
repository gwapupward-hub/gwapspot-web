export type LilGwapzMood = "all" | "happy" | "love" | "sassy" | "surprised" | "chill" | "hype";

export const LIL_GWAPZ_MOODS: readonly { id: LilGwapzMood; label: string; emoji: string; color: string }[] = [
  { id: "happy", label: "Happy", emoji: "😄", color: "purple" },
  { id: "sassy", label: "Sassy", emoji: "😎", color: "orange" },
  { id: "chill", label: "Low-key", emoji: "🌴", color: "green" },
  { id: "hype", label: "Hype", emoji: "🔥", color: "red" },
  { id: "love", label: "Love", emoji: "🫶", color: "purple" },
  { id: "surprised", label: "Surprised", emoji: "😳", color: "orange" },
  { id: "all", label: "All moods", emoji: "✦", color: "purple" },
];

// Browsing categories only; canonical reaction names, IDs, and artwork stay unchanged.
export function getLilGwapzMood(id: number): Exclude<LilGwapzMood, "all"> | null {
  if (!Number.isInteger(id) || id < 1 || id > 76) return null;
  if (id >= 9 && id <= 17) return "love";
  if (id === 19 || (id >= 31 && id <= 40)) return "sassy";
  if (id >= 41 && id <= 50) return "surprised";
  if ((id >= 51 && id <= 60) || id >= 72) return "chill";
  if (id >= 61 && id <= 71) return "hype";
  return "happy";
}
