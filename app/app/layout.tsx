import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AuthSetupRequired } from "../components/auth-setup-required";
import { isClerkConfigured } from "../lib/auth-config";
import { GwapOsProvider } from "./components/os-provider";
import { OsShell } from "./components/os-shell";
import { loadAccountWorkspace } from "./lib/os-server";

export const metadata: Metadata = {
  title: "GWAP OS",
  description:
    "A secure command center for launching products and managing a unified GWAP identity.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GwapOsLayout({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) return <AuthSetupRequired />;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/app");

  const { account, hasCloudState, state } = await loadAccountWorkspace(userId);

  return (
    <GwapOsProvider
      account={account}
      hasCloudState={hasCloudState}
      initialState={state}
    >
      <OsShell>{children}</OsShell>
    </GwapOsProvider>
  );
}
