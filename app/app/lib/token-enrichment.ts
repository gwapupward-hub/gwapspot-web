import "server-only";

import type { AssetIntelligenceResult, AssetHolding } from "./asset-intelligence";

const JUPITER_API_BASE = "https://api.jup.ag";
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const MAX_PRICE_IDS_PER_REQUEST = 50;
const MAX_PRICED_TOKEN_HOLDINGS = 149;
const MAX_METADATA_ASSETS = 12;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_TIMEOUT_MS = 12_000;

type UnknownRecord = Record<string, unknown>;

type JupiterPrice = {
  usdPrice: number;
  priceChange24h: number | null;
  liquidity: number | null;
  blockId: number | null;
};

type JupiterMetadata = {
  name: string | null;
  symbol: string | null;
  icon: string | null;
  isVerified: boolean | null;
  organicScore: number | null;
  organicScoreLabel: string | null;
};

export type EnrichedPortfolioAsset = {
  mint: string;
  kind: "native" | "spl";
  amount: string;
  decimals: number;
  name: string | null;
  symbol: string | null;
  icon: string | null;
  isVerified: boolean | null;
  organicScore: number | null;
  organicScoreLabel: string | null;
  usdPrice: number | null;
  usdValue: number | null;
  priceChange24h: number | null;
  liquidityUsd: number | null;
  priceBlockId: number | null;
  pricingStatus: "priced" | "unpriced" | "not_requested";
};

export type PortfolioEnrichmentResult = {
  status: "available" | "partial" | "not_configured" | "unavailable";
  currency: "USD";
  totalUsd: number | null;
  pricedAssetCount: number;
  unpricedAssetCount: number;
  assets: EnrichedPortfolioAsset[];
  sources: {
    pricing: "jupiter-price-v3";
    metadata: "jupiter-tokens-v2";
  };
  message: string | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getApiKey() {
  return process.env.JUPITER_API_KEY?.trim() || null;
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function tokenAmountAsNumber(holding: AssetHolding) {
  const amount = Number(holding.uiAmountString);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function blankMetadata(): JupiterMetadata {
  return {
    name: null,
    symbol: null,
    icon: null,
    isVerified: null,
    organicScore: null,
    organicScoreLabel: null,
  };
}

function rawAssets(assets: AssetIntelligenceResult): EnrichedPortfolioAsset[] {
  const result: EnrichedPortfolioAsset[] = [];
  if (assets.sol.amount !== null) {
    result.push({
      mint: WRAPPED_SOL_MINT,
      kind: "native",
      amount: String(assets.sol.amount),
      decimals: 9,
      name: "Solana",
      symbol: "SOL",
      icon: null,
      isVerified: true,
      organicScore: null,
      organicScoreLabel: null,
      usdPrice: null,
      usdValue: null,
      priceChange24h: null,
      liquidityUsd: null,
      priceBlockId: null,
      pricingStatus: "not_requested",
    });
  }
  for (const holding of assets.tokens) {
    result.push({
      mint: holding.mint,
      kind: "spl",
      amount: holding.uiAmountString,
      decimals: holding.decimals,
      ...blankMetadata(),
      usdPrice: null,
      usdValue: null,
      priceChange24h: null,
      liquidityUsd: null,
      priceBlockId: null,
      pricingStatus: "not_requested",
    });
  }
  return result;
}

async function fetchPriceBatch(
  ids: string[],
  apiKey: string,
  signal: AbortSignal,
): Promise<Map<string, JupiterPrice>> {
  if (!ids.length) return new Map();
  const url = new URL("/price/v3", JUPITER_API_BASE);
  url.searchParams.set("ids", ids.join(","));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "x-api-key": apiKey },
    signal,
  });
  if (!response.ok) throw new Error(`Jupiter Price API returned ${response.status}.`);

  const payload = asRecord(await response.json());
  if (!payload) throw new Error("Jupiter Price API returned invalid JSON.");
  const prices = new Map<string, JupiterPrice>();
  for (const id of ids) {
    const value = asRecord(payload[id]);
    const usdPrice = asFiniteNumber(value?.usdPrice);
    if (usdPrice === null || usdPrice < 0) continue;
    prices.set(id, {
      usdPrice,
      priceChange24h: asFiniteNumber(value?.priceChange24h),
      liquidity: asFiniteNumber(value?.liquidity),
      blockId: asFiniteNumber(value?.blockId),
    });
  }
  return prices;
}

async function fetchMetadata(
  mint: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<JupiterMetadata> {
  const url = new URL("/tokens/v2/search", JUPITER_API_BASE);
  url.searchParams.set("query", mint);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "x-api-key": apiKey },
    signal,
  });
  if (!response.ok) return blankMetadata();
  const payload = await response.json();
  if (!Array.isArray(payload)) return blankMetadata();
  const exact = payload.map(asRecord).find((token) => token?.id === mint);
  if (!exact) return blankMetadata();
  return {
    name: asText(exact.name),
    symbol: asText(exact.symbol),
    icon: asText(exact.icon),
    isVerified: typeof exact.isVerified === "boolean" ? exact.isVerified : null,
    organicScore: asFiniteNumber(exact.organicScore),
    organicScoreLabel: asText(exact.organicScoreLabel),
  };
}

export async function enrichPortfolio(
  assets: AssetIntelligenceResult,
  options: { timeoutMs?: number } = {},
): Promise<PortfolioEnrichmentResult> {
  const fallbackAssets = rawAssets(assets);
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      status: "not_configured",
      currency: "USD",
      totalUsd: null,
      pricedAssetCount: 0,
      unpricedAssetCount: fallbackAssets.length,
      assets: fallbackAssets,
      sources: { pricing: "jupiter-price-v3", metadata: "jupiter-tokens-v2" },
      message: "Portfolio enrichment is waiting for the server-side Jupiter API key.",
    };
  }

  if (assets.status === "unavailable") {
    return {
      status: "unavailable",
      currency: "USD",
      totalUsd: null,
      pricedAssetCount: 0,
      unpricedAssetCount: fallbackAssets.length,
      assets: fallbackAssets,
      sources: { pricing: "jupiter-price-v3", metadata: "jupiter-tokens-v2" },
      message: "Raw Solana asset data is unavailable, so the portfolio cannot be enriched.",
    };
  }

  const requestedTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(requestedTimeout, 1_000), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const tokenMints = assets.tokens
      .slice(0, MAX_PRICED_TOKEN_HOLDINGS)
      .map((holding) => holding.mint);
    const priceIds = assets.sol.amount === null
      ? tokenMints
      : [WRAPPED_SOL_MINT, ...tokenMints];
    const batches = chunk(priceIds, MAX_PRICE_IDS_PER_REQUEST);
    const batchResults = await Promise.allSettled(
      batches.map((ids) => fetchPriceBatch(ids, apiKey, controller.signal)),
    );
    const prices = new Map<string, JupiterPrice>();
    for (const result of batchResults) {
      if (result.status !== "fulfilled") continue;
      for (const [mint, price] of result.value) prices.set(mint, price);
    }

    const enriched: EnrichedPortfolioAsset[] = [];
    if (assets.sol.amount !== null) {
      const price = prices.get(WRAPPED_SOL_MINT) || null;
      enriched.push({
        mint: WRAPPED_SOL_MINT,
        kind: "native",
        amount: String(assets.sol.amount),
        decimals: 9,
        name: "Solana",
        symbol: "SOL",
        icon: null,
        isVerified: true,
        organicScore: null,
        organicScoreLabel: null,
        usdPrice: price?.usdPrice ?? null,
        usdValue: price ? assets.sol.amount * price.usdPrice : null,
        priceChange24h: price?.priceChange24h ?? null,
        liquidityUsd: price?.liquidity ?? null,
        priceBlockId: price?.blockId ?? null,
        pricingStatus: price ? "priced" : "unpriced",
      });
    }

    for (const holding of assets.tokens) {
      const price = prices.get(holding.mint) || null;
      const amount = tokenAmountAsNumber(holding);
      enriched.push({
        mint: holding.mint,
        kind: "spl",
        amount: holding.uiAmountString,
        decimals: holding.decimals,
        ...blankMetadata(),
        usdPrice: price?.usdPrice ?? null,
        usdValue: price && amount !== null ? amount * price.usdPrice : null,
        priceChange24h: price?.priceChange24h ?? null,
        liquidityUsd: price?.liquidity ?? null,
        priceBlockId: price?.blockId ?? null,
        pricingStatus: price ? "priced" : "unpriced",
      });
    }

    enriched.sort((a, b) => {
      if (a.usdValue === null && b.usdValue === null) return a.mint.localeCompare(b.mint);
      if (a.usdValue === null) return 1;
      if (b.usdValue === null) return -1;
      return b.usdValue - a.usdValue;
    });

    const metadataTargets = enriched
      .filter((asset) => asset.kind === "spl" && asset.pricingStatus === "priced")
      .slice(0, MAX_METADATA_ASSETS);
    const metadataResults = await Promise.allSettled(
      metadataTargets.map((asset) => fetchMetadata(asset.mint, apiKey, controller.signal)),
    );
    metadataResults.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      Object.assign(metadataTargets[index], result.value);
    });

    const priced = enriched.filter((asset) => asset.usdValue !== null);
    const totalUsd = priced.reduce((sum, asset) => sum + (asset.usdValue || 0), 0);
    const anyBatchFailed = batchResults.some((result) => result.status === "rejected");
    const unpricedAssetCount = enriched.length - priced.length;

    return {
      status: anyBatchFailed || unpricedAssetCount > 0 ? "partial" : "available",
      currency: "USD",
      totalUsd: priced.length ? totalUsd : null,
      pricedAssetCount: priced.length,
      unpricedAssetCount,
      assets: enriched,
      sources: { pricing: "jupiter-price-v3", metadata: "jupiter-tokens-v2" },
      message:
        anyBatchFailed
          ? "Some pricing requests failed; available prices are still shown."
          : unpricedAssetCount > 0
            ? "Some assets do not have a reliable Jupiter price and remain unpriced."
            : null,
    };
  } catch {
    return {
      status: "unavailable",
      currency: "USD",
      totalUsd: null,
      pricedAssetCount: 0,
      unpricedAssetCount: fallbackAssets.length,
      assets: fallbackAssets.map((asset) => ({ ...asset, pricingStatus: "unpriced" })),
      sources: { pricing: "jupiter-price-v3", metadata: "jupiter-tokens-v2" },
      message: "Portfolio enrichment is temporarily unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
