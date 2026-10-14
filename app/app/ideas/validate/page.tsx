import type { Metadata } from "next";
import { ValidateOwnIdea } from "./validate-own-idea";

export const metadata: Metadata = {
  title: "Validate an Idea · GWAP OS",
  description: "Turn an idea you already have into a focused validation project before you build.",
  robots: { index: false, follow: false },
};

export default function ValidateOwnIdeaPage() {
  return <ValidateOwnIdea />;
}
