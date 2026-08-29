"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { Buffer } from "buffer";
import { useState, type ReactNode } from "react";
import {
  buildWalletAuthConfig,
  type WalletAuthVariant,
} from "../lib/wallet-auth-config";
import { useResolvedWalletHost } from "./wallet-host-gate";

// Privy's Solana transaction sender expects the Node-compatible Buffer global.
// Install the browser polyfill once at the wallet-provider boundary.
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;

const endpoint =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
  clusterApiUrl(WalletAdapterNetwork.Mainnet);

// Privy owns wallet connection. The adapter carries no wallets of its own and
// never auto-connects, so it cannot race Privy for the host wallet.
const walletAdapters: [] = [];
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

export function WalletAuthProvider({
  children,
  variant = "public",
}: {
  children: ReactNode;
  variant?: WalletAuthVariant;
}) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined;
  const { primary } = useResolvedWalletHost();

  // The app variant renders inside the wallet-host gate, so the host is already
  // resolved here. Build once: a changing config would remount Privy mid-login.
  const [config] = useState(() =>
    buildWalletAuthConfig({
      variant,
      solanaConnectors,
      detectedHost: variant === "app" ? primary : null,
    }),
  );

  return (
    <PrivyProvider appId={appId} clientId={clientId} config={config}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={walletAdapters} autoConnect={false}>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PrivyProvider>
  );
}
