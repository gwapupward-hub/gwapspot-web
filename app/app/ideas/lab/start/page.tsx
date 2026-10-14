import type { Metadata } from "next";
import { FirstProjectStart } from "./first-project-start";

export const metadata: Metadata = {
  title: "Start a Project · GWAP OS",
  description: "Turn an idea you already have into a structured Idea Lab project.",
  robots: { index: false, follow: false },
};

export default function FirstProjectStartPage() {
  return <FirstProjectStart />;
}
