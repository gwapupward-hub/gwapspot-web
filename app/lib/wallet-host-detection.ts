// Capability-based wallet-host detection (GwapOS Phase 2).
//
// This deliberately does not touch user-agent strings. A Wallet Standard
// wallet (Phantom, Jupiter, Solflare, Backpack, ...) announces itself by
// registering a Wallet object on the page; we classify what's registered by
// its declared chains and features, never by sniffing the browser.
//
// This module only observes registrations - it never calls a wallet's
// connect/signMessage feature. Detection therefore cannot itself trigger a
// wallet popup or a duplicate connection attempt; that stays the exclusive
// job of the explicit, user-initiated login flow in wallet-sign-in.tsx.

import { SolanaSignMessage } from "@solana/wallet-standard-features";
import type { Wallet } from "@wallet-standard/base";
import { StandardConnect } from "@wallet-standard/features";

export type KnownWalletProvider = "phantom" | "jupiter" | "other";

export type DetectedWallet = {
  name: string;
  provider: KnownWalletProvider;
};

// A wallet counts as a supported GwapOS host only if it can both connect and
// sign an ownership message on Solana - the two capabilities the SIWS
// sign-in flow actually needs. A wallet that only supports, say, transaction
// signing but not standard:connect or solana:signMessage is not "ready" -
// it's "unsupported".
export function isSolanaCapableWallet(wallet: Wallet) {
  return wallet.chains.some((chain) => chain.startsWith("solana:"));
}

export function hasRequiredSignInFeatures(wallet: Wallet) {
  return (
    StandardConnect in wallet.features && SolanaSignMessage in wallet.features
  );
}

export function identifyKnownProvider(name: string): KnownWalletProvider {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("phantom")) return "phantom";
  if (normalized.includes("jupiter")) return "jupiter";
  return "other";
}

function toDetectedWallet(wallet: Wallet): DetectedWallet {
  return { name: wallet.name, provider: identifyKnownProvider(wallet.name) };
}

export type WalletClassification =
  // At least one registered wallet can connect and sign on Solana.
  | { status: "ready"; wallets: DetectedWallet[] }
  // At least one Solana wallet registered, but none can sign an ownership
  // message - a real wallet host, just not one GwapOS can authenticate with.
  | { status: "unsupported"; wallets: DetectedWallet[] }
  // Nothing Solana-capable has registered (yet).
  | { status: "missing" };

export function classifyRegisteredWallets(
  wallets: readonly Wallet[],
): WalletClassification {
  const solanaWallets = wallets.filter(isSolanaCapableWallet);
  if (solanaWallets.length === 0) return { status: "missing" };

  const ready = solanaWallets.filter(hasRequiredSignInFeatures);
  if (ready.length > 0) {
    return { status: "ready", wallets: ready.map(toDetectedWallet) };
  }

  return {
    status: "unsupported",
    wallets: solanaWallets.map(toDetectedWallet),
  };
}
