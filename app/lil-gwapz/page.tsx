import type { Metadata } from "next";
import LilGwapzExperience from "./lil-gwapz-experience";
import LilGwapzReviewGuard from "./lil-gwapz-review-guard";
import "./lil-gwapz-page.css";
import "./lil-gwapz-professional.css";
import "./lil-gwapz-review-fixes.css";

export const metadata: Metadata = {
  title: "Lil Gwapz — 152 Reactions. Every Mood.",
  description:
    "Browse, download, and share all 152 Lil Gwapz reaction stickers — 76 male and 76 female reactions from Reaction Pack 01.",
  alternates: { canonical: "/lil-gwapz" },
  openGraph: {
    title: "Lil Gwapz — Reaction Pack 01",
    description: "76 reactions each. 152 ways to say it.",
    url: "https://www.gwapspot.com/lil-gwapz",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lil Gwapz — Reaction Pack 01",
    description: "76 reactions each. 152 ways to say it.",
  },
};

export default function LilGwapzPage() {
  return (
    <>
      <LilGwapzReviewGuard />
      <LilGwapzExperience />
    </>
  );
}
