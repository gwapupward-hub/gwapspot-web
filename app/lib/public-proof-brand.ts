export const PUBLIC_PROOF_THEME_ORDER = [
  "green",
  "red",
  "blue",
  "purple",
  "silver",
  "orange",
] as const;

export type PublicProofThemeName = (typeof PUBLIC_PROOF_THEME_ORDER)[number];

export const PUBLIC_PROOF_THEME: Record<
  PublicProofThemeName,
  { label: string; accent: string; glow: string; imageUrl: string }
> = {
  green: {
    label: "Neon Green",
    accent: "#58ff00",
    glow: "rgba(88,255,0,.34)",
    imageUrl:
      process.env.NEXT_PUBLIC_GWAP_PUBLIC_PROOF_GREEN_IMAGE_URL?.trim() ||
      "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1787379598/gwap/public-proof/x-card-green.png",
  },
  red: {
    label: "Red",
    accent: "#ff1616",
    glow: "rgba(255,22,22,.34)",
    imageUrl:
      process.env.NEXT_PUBLIC_GWAP_PUBLIC_PROOF_RED_IMAGE_URL?.trim() ||
      "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1787379621/gwap/public-proof/x-card-red.png",
  },
  blue: {
    label: "Electric Blue",
    accent: "#2420ff",
    glow: "rgba(36,32,255,.34)",
    imageUrl:
      process.env.NEXT_PUBLIC_GWAP_PUBLIC_PROOF_BLUE_IMAGE_URL?.trim() ||
      "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1787379627/gwap/public-proof/x-card-blue.png",
  },
  purple: {
    label: "Purple",
    accent: "#9b00ff",
    glow: "rgba(155,0,255,.34)",
    imageUrl:
      process.env.NEXT_PUBLIC_GWAP_PUBLIC_PROOF_PURPLE_IMAGE_URL?.trim() ||
      "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1787379612/gwap/public-proof/x-card-purple.png",
  },
  silver: {
    label: "White / Silver",
    accent: "#f5eff4",
    glow: "rgba(245,239,244,.28)",
    imageUrl:
      process.env.NEXT_PUBLIC_GWAP_PUBLIC_PROOF_SILVER_IMAGE_URL?.trim() ||
      "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1787379633/gwap/public-proof/x-card-silver.png",
  },
  orange: {
    label: "Orange",
    accent: "#ff981d",
    glow: "rgba(255,152,29,.34)",
    imageUrl:
      process.env.NEXT_PUBLIC_GWAP_PUBLIC_PROOF_ORANGE_IMAGE_URL?.trim() ||
      "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1787379604/gwap/public-proof/x-card-orange.png",
  },
};

export function normalizePublicProofTheme(value: string | null | undefined): PublicProofThemeName {
  return (PUBLIC_PROOF_THEME_ORDER as readonly string[]).includes(value || "")
    ? (value as PublicProofThemeName)
    : "green";
}
