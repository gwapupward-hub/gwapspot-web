import type { Metadata } from "next";
import { DailyIdeasWorkspaceView } from "../../../components/daily-ideas-workspace-view";

export const metadata: Metadata = {
  title: "Workspace — Daily Ideas 2.0",
  description: "Plan, build, and collaborate on a Daily Ideas project inside a shared development workspace.",
  robots: { index: false, follow: false },
};

export default async function DailyIdeasWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DailyIdeasWorkspaceView projectId={projectId} />;
}
