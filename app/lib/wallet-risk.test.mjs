import assert from "node:assert/strict";
import test from "node:test";
import { assessWalletRisk } from "./wallet-risk.ts";

function asset(overrides = {}) {
  return {
    kind: "spl",
    usdValue: 100,
    pricingStatus: "priced",
    isVerified: true,
    organicScore: 80,
    liquidityUsd: 1_000_000,
    priceChange24h: 1,
    ...overrides,
  };
}

test("returns low risk for a diversified, verified, liquid portfolio", () => {
  const result = assessWalletRisk({
    status: "available",
    totalUsd: 400,
    pricedAssetCount: 4,
    unpricedAssetCount: 0,
    assets: [asset(), asset(), asset(), asset()],
  });

  assert.equal(result.status, "available");
  assert.equal(result.score, 0);
  assert.equal(result.level, "low");
  assert.equal(result.confidence, "high");
  assert.equal(result.factors[0].code, "no_material_portfolio_risk_signals");
});

test("flags concentration without confusing risk with GwapScore", () => {
  const result = assessWalletRisk({
    status: "available",
    totalUsd: 1000,
    pricedAssetCount: 2,
    unpricedAssetCount: 0,
    assets: [asset({ usdValue: 850 }), asset({ usdValue: 150 })],
  });

  assert.equal(result.score, 28);
  assert.equal(result.level, "moderate");
  assert.ok(result.factors.some((factor) => factor.code === "portfolio_concentration"));
  assert.match(result.message, /separate from GwapScore/);
});

test("combines explicit unverified, low-organic and illiquid exposure deterministically", () => {
  const risky = asset({
    usdValue: 700,
    isVerified: false,
    organicScore: 10,
    liquidityUsd: 10_000,
  });
  const result = assessWalletRisk({
    status: "available",
    totalUsd: 1000,
    pricedAssetCount: 2,
    unpricedAssetCount: 0,
    assets: [risky, asset({ usdValue: 300 })],
  });

  assert.equal(result.score, 76);
  assert.equal(result.level, "high");
  assert.ok(result.factors.some((factor) => factor.code === "unverified_asset_exposure"));
  assert.ok(result.factors.some((factor) => factor.code === "low_organic_score_exposure"));
  assert.ok(result.factors.some((factor) => factor.code === "low_liquidity_exposure"));
});

test("treats missing enrichment as insufficient data instead of safe", () => {
  const result = assessWalletRisk({
    status: "not_configured",
    totalUsd: null,
    pricedAssetCount: 0,
    unpricedAssetCount: 2,
    assets: [asset({ usdValue: null, pricingStatus: "not_requested" })],
  });

  assert.equal(result.status, "insufficient_data");
  assert.equal(result.score, null);
  assert.equal(result.level, null);
});

test("reports low confidence and limited price coverage for mostly unpriced portfolios", () => {
  const result = assessWalletRisk({
    status: "partial",
    totalUsd: 100,
    pricedAssetCount: 1,
    unpricedAssetCount: 3,
    assets: [
      asset({ usdValue: 100 }),
      asset({ usdValue: null, pricingStatus: "unpriced", isVerified: null, organicScore: null }),
      asset({ usdValue: null, pricingStatus: "unpriced", isVerified: null, organicScore: null }),
      asset({ usdValue: null, pricingStatus: "unpriced", isVerified: null, organicScore: null }),
    ],
  });

  assert.equal(result.status, "partial");
  assert.equal(result.confidence, "low");
  assert.ok(result.factors.some((factor) => factor.code === "limited_price_coverage"));
});
