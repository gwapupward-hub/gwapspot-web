"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
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
const walletAuthConfig: PrivyClientConfig = {
  loginMethods: ["email"],
  appearance: {
    theme: "dark",
    accentColor: "#13dd13",
    logo: "/logos/gwap-agent.png",
    walletChainType: "solana-only",
    showWalletLoginFirst: false,
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "off" },
    solana: { createOnLogin: "users-without-wallets" },
  },
};

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined;

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={walletAuthConfig}
    >
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={walletAdapters} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PrivyProvider>
  );
}
