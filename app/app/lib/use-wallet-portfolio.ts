"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type PortfolioAsset = {
  mint: string;
  kind: "native" | "spl";
  amount: string;
  name: string | null;
  symbol: string | null;
  usdPrice: number | null;
  usdValue: number | null;
  priceChange24h: number | null;
  pricingStatus: "priced" | "unpriced" | "not_requested";
};

export type PortfolioPayload = {
  wallet: string;
  network: "mainnet-beta";
  status: "available" | "partial" | "unavailable";
  sol: { lamports: number | null; amount: number | null };
  tokenAccountCount: number | null;
  uniqueMintCount: number | null;
  tokenPrograms: {
    classic: "available" | "unavailable";
    token2022: "available" | "unavailable";
  };
  portfolio: {
    status: "available" | "partial" | "not_configured" | "unavailable";
    currency: "USD";
    totalUsd: number | null;
    pricedAssetCount: number;
    unpricedAssetCount: number;
    assets: PortfolioAsset[];
    message: string | null;
  };
  generatedAt: string;
};

export type WalletPortfolioState =
  | { status: "loading"; payload: null; error: null }
  | { status: "ready"; payload: PortfolioPayload; error: null }
  | { status: "error"; payload: null; error: string };

// The wallet balance and the full portfolio card both need this same
// wallet's /api/wallet/portfolio data. Without a shared source, the OS
// shell's header balance used to hit the Solana RPC directly - exposing an
// RPC URL to the browser and racing an independent fetch against the
// portfolio card's own - and even after both went through the API, two
// independent component-local fetches would still mean two requests
// against the same rate-limited endpoint every time /app loaded. This
// module-level store, shared by every useWalletPortfolio() call in the
// tab, guarantees exactly one request in flight at a time, and one
// refetch() updates every subscriber - including "Refresh balances" in
// the portfolio card now also updating the header stat, which two
// independent fetches never did.
const initialState: WalletPortfolioState = {
  status: "loading",
  payload: null,
  error: null,
};
let cachedState: WalletPortfolioState = initialState;
let inFlight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function getSnapshot() {
  return cachedState;
}

// Server render always sees the pristine loading state - this hook has
// nothing to fetch with server-side, and a fixed snapshot here (rather
// than the live, mutable cachedState) is what keeps useSyncExternalStore's
// hydration reconciliation correct.
function getServerSnapshot() {
  return initialState;
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function publish(next: WalletPortfolioState) {
  cachedState = next;
  subscribers.forEach((callback) => callback());
}

function load(getAccessToken: () => Promise<string | null>) {
  // Every caller - the initial mount and an explicit refetch alike - folds
  // into whichever request is already running rather than firing a second
  // one, so responses can never resolve out of order against each other.
  if (inFlight) return inFlight;

  const request = (async () => {
    publish({ status: "loading", payload: null, error: null });
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/wallet/portfolio", {
        cache: "no-store",
        credentials: "same-origin",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = (await response.json().catch(() => null)) as
        | (PortfolioPayload & { error?: string })
        | null;
      if (!response.ok || !payload || !payload.wallet) {
        throw new Error(payload?.error || "Portfolio could not load.");
      }
      publish({ status: "ready", payload, error: null });
    } catch (error) {
      publish({
        status: "error",
        payload: null,
        error: error instanceof Error ? error.message : "Portfolio could not load.",
      });
    } finally {
      inFlight = null;
    }
  })();

  inFlight = request;
  return request;
}

// Sign-out is followed by a hard reload before /app can be reached again
// (wallet-sign-in.tsx uses window.location.replace), which already resets
// this module's state - but clearing it explicitly removes any dependence
// on that navigation detail staying true.
export function clearWalletPortfolioCache() {
  cachedState = initialState;
  inFlight = null;
}

export function useWalletPortfolio() {
  const { getAccessToken } = usePrivy();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (cachedState.status === "loading" && !inFlight) {
      void load(getAccessToken);
    }
  }, [getAccessToken]);

  const refetch = useCallback(() => {
    void load(getAccessToken);
  }, [getAccessToken]);

  return { ...state, refetch };
}
