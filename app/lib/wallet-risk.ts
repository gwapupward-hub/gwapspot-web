export type WalletRiskLevel = "low" | "moderate" | "elevated" | "high";
export type WalletRiskSeverity = "info" | "low" | "moderate" | "high";

export type WalletRiskFactor = {
  code: string;
  severity: WalletRiskSeverity;
  points: number;
  message: string;
  evidence: Record<string, number | string | boolean | null>;
};

export type WalletRiskResult = {
  status: "available" | "partial" | "insufficient_data" | "unavailable";
  score: number | null;
  level: WalletRiskLevel | null;
  confidence: "high" | "medium" | "low" | null;
  factors: WalletRiskFactor[];
  coverage: {
    totalAssets: number;
    pricedAssets: number;
    pricedAssetRatio: number | null;
    metadataKnownAssets: number;
  };
  message: string;
};

type RiskAsset = {
  kind: "native" | "spl";
  usdValue: number | null;
  pricingStatus: "priced" | "unpriced" | "not_requested";
  isVerified: boolean | null;
  organicScore: number | null;
  liquidityUsd: number | null;
  priceChange24h: number | null;
};

type RiskPortfolio = {
  status: "available" | "partial" | "not_configured" | "unavailable";
  totalUsd: number | null;
  pricedAssetCount: number;
  unpricedAssetCount: number;
  assets: RiskAsset[];
};

function round(value: number, decimals = 4) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function levelFor(score: number): WalletRiskLevel {
  if (score >= 70) return "high";
  if (score >= 45) return "elevated";
  if (score >= 20) return "moderate";
  return "low";
}

function factor(
  code: string,
  severity: WalletRiskSeverity,
  points: number,
  message: string,
  evidence: WalletRiskFactor["evidence"],
): WalletRiskFactor {
  return { code, severity, points, message, evidence };
}

export function assessWalletRisk(portfolio: RiskPortfolio): WalletRiskResult {
  const totalAssets = portfolio.assets.length;
  const pricedAssets = portfolio.assets.filter(
    (asset) => asset.pricingStatus === "priced" && asset.usdValue !== null,
  );
  const pricedAssetRatio = totalAssets ? pricedAssets.length / totalAssets : null;
  const metadataKnownAssets = portfolio.assets.filter(
    (asset) => asset.kind === "native" || asset.isVerified !== null || asset.organicScore !== null,
  ).length;
  const coverage = {
    totalAssets,
    pricedAssets: pricedAssets.length,
    pricedAssetRatio: pricedAssetRatio === null ? null : round(pricedAssetRatio),
    metadataKnownAssets,
  };

  if (portfolio.status === "unavailable") {
    return {
      status: "unavailable",
      score: null,
      level: null,
      confidence: null,
      factors: [],
      coverage,
      message: "Wallet risk cannot be assessed because portfolio enrichment is unavailable.",
    };
  }

  if (portfolio.status === "not_configured") {
    return {
      status: "insufficient_data",
      score: null,
      level: null,
      confidence: null,
      factors: [],
      coverage,
      message: "Wallet risk is waiting for portfolio enrichment data.",
    };
  }

  if (!totalAssets || !pricedAssets.length || portfolio.totalUsd === null || portfolio.totalUsd <= 0) {
    return {
      status: "insufficient_data",
      score: null,
      level: null,
      confidence: null,
      factors: [],
      coverage,
      message: "There is not enough priced portfolio data for a reliable risk assessment.",
    };
  }

  const factors: WalletRiskFactor[] = [];
  const totalUsd = portfolio.totalUsd;
  const sortedValues = pricedAssets
    .map((asset) => asset.usdValue || 0)
    .sort((a, b) => b - a);
  const largestValue = sortedValues[0] || 0;
  const largestShare = totalUsd > 0 ? largestValue / totalUsd : 0;

  if (largestShare >= 0.8) {
    factors.push(
      factor(
        "portfolio_concentration",
        "high",
        28,
        "A single priced asset represents at least 80% of the priced portfolio.",
        { largestAssetShare: round(largestShare), largestAssetUsd: round(largestValue, 2) },
      ),
    );
  } else if (largestShare >= 0.6) {
    factors.push(
      factor(
        "portfolio_concentration",
        "moderate",
        16,
        "A single priced asset represents at least 60% of the priced portfolio.",
        { largestAssetShare: round(largestShare), largestAssetUsd: round(largestValue, 2) },
      ),
    );
  }

  const splPriced = pricedAssets.filter((asset) => asset.kind === "spl");
  const unverifiedValue = splPriced.reduce(
    (sum, asset) => sum + (asset.isVerified === false ? asset.usdValue || 0 : 0),
    0,
  );
  const unverifiedShare = totalUsd > 0 ? unverifiedValue / totalUsd : 0;
  if (unverifiedShare >= 0.35) {
    factors.push(
      factor(
        "unverified_asset_exposure",
        "high",
        24,
        "At least 35% of priced portfolio value is in assets explicitly marked unverified by the metadata provider.",
        { unverifiedValueShare: round(unverifiedShare), unverifiedUsd: round(unverifiedValue, 2) },
      ),
    );
  } else if (unverifiedShare >= 0.1) {
    factors.push(
      factor(
        "unverified_asset_exposure",
        "moderate",
        12,
        "At least 10% of priced portfolio value is in assets explicitly marked unverified by the metadata provider.",
        { unverifiedValueShare: round(unverifiedShare), unverifiedUsd: round(unverifiedValue, 2) },
      ),
    );
  }

  const lowOrganicValue = splPriced.reduce(
    (sum, asset) =>
      sum +
      (asset.organicScore !== null && asset.organicScore < 30 ? asset.usdValue || 0 : 0),
    0,
  );
  const lowOrganicShare = totalUsd > 0 ? lowOrganicValue / totalUsd : 0;
  if (lowOrganicShare >= 0.25) {
    factors.push(
      factor(
        "low_organic_score_exposure",
        "high",
        18,
        "At least 25% of priced portfolio value is in assets with an organic score below 30.",
        { lowOrganicValueShare: round(lowOrganicShare), lowOrganicUsd: round(lowOrganicValue, 2) },
      ),
    );
  } else if (lowOrganicShare >= 0.1) {
    factors.push(
      factor(
        "low_organic_score_exposure",
        "moderate",
        9,
        "At least 10% of priced portfolio value is in assets with an organic score below 30.",
        { lowOrganicValueShare: round(lowOrganicShare), lowOrganicUsd: round(lowOrganicValue, 2) },
      ),
    );
  }

  const illiquidValue = splPriced.reduce(
    (sum, asset) =>
      sum +
      (asset.liquidityUsd !== null && asset.liquidityUsd < 50_000 ? asset.usdValue || 0 : 0),
    0,
  );
  const illiquidShare = totalUsd > 0 ? illiquidValue / totalUsd : 0;
  if (illiquidShare >= 0.3) {
    factors.push(
      factor(
        "low_liquidity_exposure",
        "high",
        18,
        "At least 30% of priced portfolio value is in assets with less than $50K reported liquidity.",
        { lowLiquidityValueShare: round(illiquidShare), lowLiquidityUsd: round(illiquidValue, 2) },
      ),
    );
  } else if (illiquidShare >= 0.1) {
    factors.push(
      factor(
        "low_liquidity_exposure",
        "moderate",
        9,
        "At least 10% of priced portfolio value is in assets with less than $50K reported liquidity.",
        { lowLiquidityValueShare: round(illiquidShare), lowLiquidityUsd: round(illiquidValue, 2) },
      ),
    );
  }

  const drawdownValue = pricedAssets.reduce(
    (sum, asset) =>
      sum +
      (asset.priceChange24h !== null && asset.priceChange24h <= -30 ? asset.usdValue || 0 : 0),
    0,
  );
  const drawdownShare = totalUsd > 0 ? drawdownValue / totalUsd : 0;
  if (drawdownShare >= 0.25) {
    factors.push(
      factor(
        "sharp_24h_drawdown_exposure",
        "moderate",
        12,
        "At least 25% of priced portfolio value is in assets down 30% or more over 24 hours.",
        { drawdownValueShare: round(drawdownShare), drawdownUsd: round(drawdownValue, 2) },
      ),
    );
  }

  if (pricedAssetRatio !== null && pricedAssetRatio < 0.5 && totalAssets >= 3) {
    factors.push(
      factor(
        "limited_price_coverage",
        "low",
        8,
        "Fewer than half of detected assets have a reliable price, reducing portfolio visibility.",
        { pricedAssetRatio: round(pricedAssetRatio), totalAssets, pricedAssets: pricedAssets.length },
      ),
    );
  }

  const score = clamp(
    Math.round(factors.reduce((sum, current) => sum + current.points, 0)),
    0,
    100,
  );
  const metadataRatio = totalAssets ? metadataKnownAssets / totalAssets : 0;
  const confidence =
    pricedAssetRatio !== null && pricedAssetRatio >= 0.8 && metadataRatio >= 0.6
      ? "high"
      : pricedAssetRatio !== null && pricedAssetRatio >= 0.5
        ? "medium"
        : "low";
  const status = portfolio.status === "partial" || confidence === "low" ? "partial" : "available";
  const level = levelFor(score);

  if (!factors.length) {
    factors.push(
      factor(
        "no_material_portfolio_risk_signals",
        "info",
        0,
        "No material portfolio-risk signals crossed the current deterministic thresholds.",
        { pricedPortfolioUsd: round(totalUsd, 2) },
      ),
    );
  }

  return {
    status,
    score,
    level,
    confidence,
    factors,
    coverage,
    message: `Wallet exposure risk ${score}/100 · ${level}. This is separate from GwapScore reputation.`,
  };
}
