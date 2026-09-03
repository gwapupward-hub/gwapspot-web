import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AuthSetupRequired } from "../components/auth-setup-required";
import { WalletAuthProvider } from "../components/wallet-auth-provider";
import { isWalletAuthConfigured } from "../lib/auth-config";
import {
  gwapOsAppMetadata,
  gwapOsAppViewport,
} from "../lib/gwapos-app-metadata";
import { getAuthenticatedWalletIdentityResult } from "../lib/privy-server";
import { GnsIdentityHydrationBridge } from "./components/gns-identity-hydration-bridge";
import { GnsRegistrationSyncBridge } from "./components/gns-registration-sync-bridge";
import { GwapOsProvider } from "./components/os-provider";
import { OsShell } from "./components/os-shell";
import { SessionCheckUnavailable } from "./components/session-check-unavailable";
import "./gwapos-wallet.css";
import "./gwapos-mobile-hardening.css";
import {
  cachedGnsIdentity,
  loadAccountWorkspace,
  seedNewWorkspaceFromGns,
} from "./lib/os-server";

export const metadata: Metadata = {
  ...gwapOsAppMetadata,
  title: "GWAP OS",
  description:
    "The wallet-native operating layer for GWAP identity, reputation, commerce, and proofs.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = gwapOsAppViewport;

export const dynamic = "force-dynamic";

export default async function GwapOsLayout({ children }: { children: ReactNode }) {
  if (!isWalletAuthConfigured()) return <AuthSetupRequired />;

  const result = await getAuthenticatedWalletIdentityResult();
  if (result.status === "unauthenticated") {
    redirect("/sign-in?redirect_url=/app");
  }
  if (result.status === "unavailable") return <SessionCheckUnavailable />;

  const workspace = await loadAccountWorkspace(result.identity);
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
