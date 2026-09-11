export type PortfolioAllocation = {
  symbol: string;
  weightBps: number;
};

export type PortfolioIntent = {
  currency: "USD";
  budgetUsd: number;
  allocations: PortfolioAllocation[];
};

export type StockAsset = {
  symbol: string;
  mint: string;
  decimals: number;
  name?: string;
};

export type StockQuote = {
  symbol: string;
  priceUsd: number;
  quotedAt: string;
  source: string;
};

export type PlannedAllocation = {
  symbol: string;
  mint: string;
  weightBps: number;
  targetUsd: number;
  quotedPriceUsd: number;
  estimatedTokenAmount: number;
};

export type PortfolioPlan = {
  currency: "USD";
  budgetUsd: number;
  allocations: PlannedAllocation[];
  quoteSource: string;
  quotedAt: string;
};

export type PortfolioValidationOptions = {
  nowMs?: number;
  maxQuoteAgeMs?: number;
};

const BASIS_POINTS = 10_000;
const USD_CENTS = 100;
const DEFAULT_MAX_QUOTE_AGE_MS = 30_000;

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * USD_CENTS) / USD_CENTS;
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function validatePortfolioIntent(intent: PortfolioIntent): PortfolioIntent {
  if (intent.currency !== "USD") {
    throw new Error("GWAPfolio MVP only supports USD-denominated intents");
  }

  assertFinitePositive(intent.budgetUsd, "budgetUsd");

  if (!Array.isArray(intent.allocations) || intent.allocations.length === 0) {
    throw new Error("portfolio must contain at least one allocation");
  }

  const seen = new Set<string>();
  const allocations = intent.allocations.map((allocation) => {
    const symbol = normalizeSymbol(allocation.symbol);
    if (!symbol) throw new Error("allocation symbol is required");
    if (seen.has(symbol)) throw new Error(`duplicate allocation: ${symbol}`);
    seen.add(symbol);

    if (!Number.isInteger(allocation.weightBps) || allocation.weightBps <= 0) {
      throw new Error(`weightBps for ${symbol} must be a positive integer`);
    }

    return { symbol, weightBps: allocation.weightBps };
  });

  const totalWeight = allocations.reduce((sum, allocation) => sum + allocation.weightBps, 0);
  if (totalWeight !== BASIS_POINTS) {
    throw new Error(`portfolio allocation must equal 10000 bps; received ${totalWeight}`);
  }

  return {
    currency: "USD",
    budgetUsd: roundUsd(intent.budgetUsd),
    allocations,
  };
}

export function buildPortfolioPlan(
  rawIntent: PortfolioIntent,
  assets: StockAsset[],
  quotes: StockQuote[],
  options: PortfolioValidationOptions = {},
): PortfolioPlan {
  const intent = validatePortfolioIntent(rawIntent);
  const nowMs = options.nowMs ?? Date.now();
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? DEFAULT_MAX_QUOTE_AGE_MS;

  const assetBySymbol = new Map(assets.map((asset) => [normalizeSymbol(asset.symbol), asset]));
  const quoteBySymbol = new Map(quotes.map((quote) => [normalizeSymbol(quote.symbol), quote]));

  const planned = intent.allocations.map((allocation) => {
    const asset = assetBySymbol.get(allocation.symbol);
    if (!asset) throw new Error(`unsupported stock asset: ${allocation.symbol}`);
    if (!asset.mint) throw new Error(`missing mint for ${allocation.symbol}`);
    if (!Number.isInteger(asset.decimals) || asset.decimals < 0) {
      throw new Error(`invalid decimals for ${allocation.symbol}`);
    }

    const quote = quoteBySymbol.get(allocation.symbol);
    if (!quote) throw new Error(`missing quote for ${allocation.symbol}`);
    assertFinitePositive(quote.priceUsd, `quote price for ${allocation.symbol}`);

    const quoteTimeMs = Date.parse(quote.quotedAt);
    if (!Number.isFinite(quoteTimeMs)) throw new Error(`invalid quote timestamp for ${allocation.symbol}`);
    if (quoteTimeMs > nowMs + 1_000) throw new Error(`quote timestamp is in the future for ${allocation.symbol}`);
    if (nowMs - quoteTimeMs > maxQuoteAgeMs) throw new Error(`stale quote for ${allocation.symbol}`);

    const targetUsd = roundUsd((intent.budgetUsd * allocation.weightBps) / BASIS_POINTS);
    const tokenScale = 10 ** asset.decimals;
    const rawTokenAmount = targetUsd / quote.priceUsd;
    const estimatedTokenAmount = Math.floor(rawTokenAmount * tokenScale) / tokenScale;

    return {
      symbol: allocation.symbol,
      mint: asset.mint,
      weightBps: allocation.weightBps,
      targetUsd,
      quotedPriceUsd: quote.priceUsd,
      estimatedTokenAmount,
    } satisfies PlannedAllocation;
  });

  // Correct any cent-level drift introduced by per-line USD rounding by assigning it
  // to the final allocation. This preserves the user's exact budget deterministically.
  const plannedTotal = roundUsd(planned.reduce((sum, item) => sum + item.targetUsd, 0));
  const drift = roundUsd(intent.budgetUsd - plannedTotal);
  if (drift !== 0 && planned.length > 0) {
    const last = planned[planned.length - 1];
    last.targetUsd = roundUsd(last.targetUsd + drift);
    const asset = assetBySymbol.get(last.symbol)!;
    last.estimatedTokenAmount =
      Math.floor((last.targetUsd / last.quotedPriceUsd) * 10 ** asset.decimals) / 10 ** asset.decimals;
  }

  const sources = new Set(
    intent.allocations.map((allocation) => quoteBySymbol.get(allocation.symbol)!.source),
  );
  if (sources.size !== 1) throw new Error("portfolio quotes must use one quote source for MVP execution");

  const quotedAt = intent.allocations
    .map((allocation) => quoteBySymbol.get(allocation.symbol)!.quotedAt)
    .sort()[0];

  return {
    currency: "USD",
    budgetUsd: intent.budgetUsd,
    allocations: planned,
    quoteSource: [...sources][0],
    quotedAt,
  };
}

export function stocklanaDemoIntent(): PortfolioIntent {
  return {
    currency: "USD",
    budgetUsd: 500,
    allocations: [
      { symbol: "NVDA", weightBps: 3000 },
      { symbol: "MSFT", weightBps: 2500 },
      { symbol: "GOOGL", weightBps: 2000 },
      { symbol: "AMZN", weightBps: 1500 },
      { symbol: "META", weightBps: 1000 },
    ],
  };
}
