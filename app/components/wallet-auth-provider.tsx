"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { Buffer } from "buffer";
import type { ReactNode } from "react";

// Privy's Solana transaction sender expects the Node-compatible Buffer global.
// Install the browser polyfill once at the wallet-provider boundary.
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;

const endpoint =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
  clusterApiUrl(WalletAdapterNetwork.Mainnet);
const walletAdapters: [] = [];
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

const baseAppearance: PrivyClientConfig["appearance"] = {
  theme: "dark",
  accentColor: "#13dd13",
  logo: "/logos/gwap-agent.png",
  walletChainType: "solana-only",
  walletList: [
    "phantom",
    "jupiter",
    "solflare",
    "backpack",
    "detected_solana_wallets",
  ],
  showWalletLoginFirst: true,
};

// app.gwapspot.com must never offer email-wallet onboarding (Phase 1). The
// sign-in UI already hides that button for the app variant, but the login
// method itself must also be unavailable at the provider level - a UI gate
// alone would leave the capability reachable if the modal is ever opened
// through a path that doesn't go through that button.
const walletOnlyAuthConfig: PrivyClientConfig = {
  loginMethods: ["wallet"],
  appearance: baseAppearance,
  externalWallets: {
    solana: { connectors: solanaConnectors },
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "off" },
    solana: { createOnLogin: "off" },
  },
};

const walletAndEmailAuthConfig: PrivyClientConfig = {
  loginMethods: ["wallet", "email"],
  appearance: baseAppearance,
  externalWallets: {
    solana: { connectors: solanaConnectors },
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "off" },
    solana: { createOnLogin: "users-without-wallets" },
  },
};

export function WalletAuthProvider({
  children,
  walletOnly = false,
}: {
  children: ReactNode;
  // Set on app.gwapspot.com's sign-in gateway to keep email-wallet
  // onboarding fully unavailable there, not just hidden from the UI.
  walletOnly?: boolean;
}) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined;

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={walletOnly ? walletOnlyAuthConfig : walletAndEmailAuthConfig}
    >
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={walletAdapters} autoConnect={false}>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PrivyProvider>
  );
}
