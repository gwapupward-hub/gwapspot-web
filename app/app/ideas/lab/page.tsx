import type { Metadata } from "next";
import { IdeaLabView } from "../../components/idea-lab-view";

export const metadata: Metadata = {
  title: "Idea Lab — Daily Ideas 2.0",
  description: "Develop, validate, build, and launch projects from your saved Daily Ideas opportunities.",
};

export default function IdeaLabPage() {
  return <IdeaLabView />;
}
