"use client";

// Privy owns authentication and wallet connectivity for GWAP OS. Email is the
// default account entry path; Solana wallets remain available when a user wants
// to connect one directly. Email users may receive/reuse a Privy embedded Solana
// wallet in the background so blockchain features are ready when actually needed.
import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { Buffer } from "buffer";
import type { ReactNode } from "react";

// Privy's Solana transaction sender expects the Node-compatible Buffer global.
// Install the browser polyfill once at the auth-provider boundary.
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });
const ppvDevnetRpcUrl =
  process.env.NEXT_PUBLIC_PPV_RPC_URL?.trim() || "https://api.devnet.solana.com";
const ppvDevnetWsUrl = ppvDevnetRpcUrl.replace(/^http/, "ws");

const authConfig: PrivyClientConfig = {
  loginMethods: ["email", "wallet"],
  appearance: {
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
    showWalletLoginFirst: false,
  },
  externalWallets: {
    solana: { connectors: solanaConnectors },
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "off" },
    // Keep wallet provisioning as invisible infrastructure for account users.
    // The onboarding surface does not require crypto knowledge or a wallet choice.
    solana: { createOnLogin: "users-without-wallets" },
  },
  solana: {
    rpcs: {
      "solana:devnet": {
        rpc: createSolanaRpc(ppvDevnetRpcUrl),
        rpcSubscriptions: createSolanaRpcSubscriptions(ppvDevnetWsUrl),
      },
    },
  },
};

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined;

  return (
    <PrivyProvider appId={appId} clientId={clientId} config={authConfig}>
      {children}
    </PrivyProvider>
  );
}
