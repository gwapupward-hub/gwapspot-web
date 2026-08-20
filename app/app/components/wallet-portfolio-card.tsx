"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type PortfolioAsset = {
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

type PortfolioPayload = {
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

type LoadState =
  | { status: "loading"; payload: null; error: null }
  | { status: "ready"; payload: PortfolioPayload; error: null }
  | { status: "error"; payload: null; error: string };

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const tokenAmount = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

function shortMint(mint: string) {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function formatTokenAmount(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return tokenAmount.format(numeric);
}

export function WalletPortfolioCard() {
  const { getAccessToken } = usePrivy();
  const [state, setState] = useState<LoadState>({
    status: "loading",
    payload: null,
    error: null,
  });

  const load = useCallback(async () => {
    setState({ status: "loading", payload: null, error: null });
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
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({
        status: "error",
        payload: null,
        error: error instanceof Error ? error.message : "Portfolio could not load.",
      });
    }
  }, [getAccessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleAssets = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.payload.portfolio.assets
      .filter((asset) => asset.kind === "native" || Number(asset.amount) > 0)
      .slice(0, 8);
  }, [state]);

  return (
    <article className="os-runtime-panel">
      <div className="os-console-chrome">
        <span>~/wallet/portfolio</span>
        <span>
          {state.status === "loading"
            ? "SYNCING"
            : state.status === "error"
              ? "LIMITED"
              : "MAINNET"}
        </span>
      </div>

      {state.status === "loading" ? (
        <p className="os-runtime-warning" role="status">
          Reading your Solana mainnet balances…
        </p>
      ) : state.status === "error" ? (
        <div className="os-runtime-note">
          <span className="os-terminal-label">PORTFOLIO UNAVAILABLE</span>
          <h2>Balance sync paused.</h2>
          <p>{state.error}</p>
          <button type="button" onClick={() => void load()}>
            Retry portfolio sync
          </button>
        </div>
      ) : (
        <>
          <div className="os-runtime-note">
            <span className="os-terminal-label">SOLANA MAINNET · LIVE WALLET</span>
            <h2>
              {state.payload.portfolio.totalUsd === null
                ? `${tokenAmount.format(state.payload.sol.amount ?? 0)} SOL`
                : usd.format(state.payload.portfolio.totalUsd)}
            </h2>
            <p>
              {state.payload.sol.amount === null
                ? "SOL balance unavailable"
                : `${tokenAmount.format(state.payload.sol.amount)} SOL`}
              {` · ${state.payload.uniqueMintCount ?? 0} token${state.payload.uniqueMintCount === 1 ? "" : "s"}`}
              {state.payload.portfolio.totalUsd === null
                ? " · USD pricing unavailable"
                : ` · ${state.payload.portfolio.pricedAssetCount} priced asset${state.payload.portfolio.pricedAssetCount === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="os-process-table" aria-label="Wallet assets">
            <div className="os-process-row os-process-head">
              <span>ASSET</span>
              <span>BALANCE</span>
              <span>VALUE</span>
            </div>
            {visibleAssets.length ? (
              visibleAssets.map((asset) => (
                <div className="os-process-row" key={`${asset.kind}:${asset.mint}`}>
                  <span>
                    <strong>{asset.symbol || asset.name || shortMint(asset.mint)}</strong>
                    {asset.kind === "spl" && (asset.symbol || asset.name) ? (
                      <small>{shortMint(asset.mint)}</small>
                    ) : null}
                  </span>
                  <span>{formatTokenAmount(asset.amount)}</span>
                  <span>{asset.usdValue === null ? "—" : usd.format(asset.usdValue)}</span>
                </div>
              ))
            ) : (
              <p className="os-runtime-warning">No non-zero assets were returned for this wallet.</p>
            )}
          </div>

          <div className="os-inline-actions">
            <button type="button" onClick={() => void load()}>
              Refresh balances
            </button>
            <span className="os-terminal-label">
              TOKEN · {state.payload.tokenPrograms.classic.toUpperCase()} · TOKEN-2022 · {state.payload.tokenPrograms.token2022.toUpperCase()}
            </span>
          </div>

          {state.payload.portfolio.message ? (
            <p className="os-settings-note">{state.payload.portfolio.message}</p>
          ) : null}
        </>
      )}
    </article>
  );
}
