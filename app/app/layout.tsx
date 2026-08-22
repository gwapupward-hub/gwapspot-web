import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AuthSetupRequired } from "../components/auth-setup-required";
import { WalletAuthProvider } from "../components/wallet-auth-provider";
import { isWalletAuthConfigured } from "../lib/auth-config";
import { getAuthenticatedWalletIdentity } from "../lib/privy-server";
import { GnsIdentityHydrationBridge } from "./components/gns-identity-hydration-bridge";
import { GnsRegistrationSyncBridge } from "./components/gns-registration-sync-bridge";
import { GwapOsProvider } from "./components/os-provider";
import { OsShell } from "./components/os-shell";
import {
  cachedGnsIdentity,
  loadAccountWorkspace,
  seedNewWorkspaceFromGns,
} from "./lib/os-server";

export const metadata: Metadata = {
  title: "GWAP OS",
  description:
    "The wallet-native operating layer for GWAP identity, reputation, commerce, and proofs.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GwapOsLayout({ children }: { children: ReactNode }) {
  if (!isWalletAuthConfigured()) return <AuthSetupRequired />;

  const identity = await getAuthenticatedWalletIdentity();
  if (!identity) redirect("/sign-in?redirect_url=/app");

  const workspace = await loadAccountWorkspace(identity);
  const gnsIdentity = cachedGnsIdentity(workspace.gwapAccount.primaryGnsIdentity);
  const state = seedNewWorkspaceFromGns(
    workspace.state,
    workspace.hasCloudState,
    gnsIdentity,
  );

  return (
    <WalletAuthProvider>
      <GwapOsProvider
        account={workspace.account}
        gnsIdentity={gnsIdentity}
        hasCloudState={workspace.hasCloudState}
        initialState={state}
      >
        <GnsIdentityHydrationBridge />
        <GnsRegistrationSyncBridge />
        <OsShell>{children}</OsShell>
      </GwapOsProvider>
    </WalletAuthProvider>
  );
}
