import type { Metadata } from "next";
import LilGwapzExperience from "../lil-gwapz-experience";
export const metadata: Metadata = {
  title: "Browse All 152 Lil Gwapz Stickers",
  description:
    "Search all 152 Lil Gwapz stickers, preview in high resolution, and download original transparent PNGs.",
  alternates: { canonical: "/lil-gwapz/browse" },
  openGraph: {
    title: "Lil Gwapz — Find Your Reaction",
    url: "https://www.gwapspot.com/lil-gwapz/browse",
    images: ["/lil-gwapz/brand/logo.png"],
  },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ character?: string }>;
}) {
  const { character } = await searchParams;
  return (
    <LilGwapzExperience
      key={character ?? "ALL"}
      initialCharacter={
        character === "M" || character === "F" ? character : "ALL"
      }
    />
  );
}
