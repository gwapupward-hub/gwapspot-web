import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPortfolioPlan,
  stocklanaDemoIntent,
  validatePortfolioIntent,
} from "./gwapfolio.ts";

const NOW = Date.parse("2026-09-11T14:30:00.000Z");
const ASSETS = [
  { symbol: "NVDA", mint: "Nvda111111111111111111111111111111111111111", decimals: 6 },
  { symbol: "MSFT", mint: "Msft111111111111111111111111111111111111111", decimals: 6 },
  { symbol: "GOOGL", mint: "Goog111111111111111111111111111111111111111", decimals: 6 },
  { symbol: "AMZN", mint: "Amzn111111111111111111111111111111111111111", decimals: 6 },
  { symbol: "META", mint: "Meta111111111111111111111111111111111111111", decimals: 6 },
];
const QUOTES = [
  { symbol: "NVDA", priceUsd: 175, quotedAt: "2026-09-11T14:29:50.000Z", source: "fixture" },
  { symbol: "MSFT", priceUsd: 500, quotedAt: "2026-09-11T14:29:50.000Z", source: "fixture" },
  { symbol: "GOOGL", priceUsd: 250, quotedAt: "2026-09-11T14:29:50.000Z", source: "fixture" },
  { symbol: "AMZN", priceUsd: 200, quotedAt: "2026-09-11T14:29:50.000Z", source: "fixture" },
  { symbol: "META", priceUsd: 800, quotedAt: "2026-09-11T14:29:50.000Z", source: "fixture" },
];

test("STOCKLANA demo intent is exactly $500 and 10000 bps", () => {
  const intent = validatePortfolioIntent(stocklanaDemoIntent());
  assert.equal(intent.budgetUsd, 500);
  assert.equal(intent.allocations.reduce((sum, item) => sum + item.weightBps, 0), 10_000);
});

test("deterministic plan preserves exact budget across the five-stock demo basket", () => {
  const plan = buildPortfolioPlan(stocklanaDemoIntent(), ASSETS, QUOTES, { nowMs: NOW });
  assert.equal(plan.allocations.length, 5);
  assert.equal(plan.allocations.reduce((sum, item) => sum + item.targetUsd, 0), 500);
  assert.deepEqual(
    plan.allocations.map((item) => [item.symbol, item.targetUsd]),
    [
      ["NVDA", 150],
      ["MSFT", 125],
      ["GOOGL", 100],
      ["AMZN", 75],
      ["META", 50],
    ],
  );
  assert.equal(plan.quoteSource, "fixture");
});

test("rejects allocations that do not equal 100 percent", () => {
  assert.throws(
    () =>
      validatePortfolioIntent({
        currency: "USD",
        budgetUsd: 500,
        allocations: [
          { symbol: "NVDA", weightBps: 5000 },
          { symbol: "MSFT", weightBps: 4000 },
        ],
      }),
    /10000 bps/,
  );
});

test("rejects duplicate symbols after normalization", () => {
  assert.throws(
    () =>
      validatePortfolioIntent({
        currency: "USD",
        budgetUsd: 100,
        allocations: [
          { symbol: "nvda", weightBps: 5000 },
          { symbol: "NVDA", weightBps: 5000 },
        ],
      }),
    /duplicate allocation: NVDA/,
  );
});

test("fails closed when a requested stock is not in the asset registry", () => {
  const assets = ASSETS.filter((asset) => asset.symbol !== "META");
  assert.throws(
    () => buildPortfolioPlan(stocklanaDemoIntent(), assets, QUOTES, { nowMs: NOW }),
    /unsupported stock asset: META/,
  );
});

test("rejects missing quotes", () => {
  const quotes = QUOTES.filter((quote) => quote.symbol !== "AMZN");
  assert.throws(
    () => buildPortfolioPlan(stocklanaDemoIntent(), ASSETS, quotes, { nowMs: NOW }),
    /missing quote for AMZN/,
  );
});

test("rejects stale quotes", () => {
  const quotes = QUOTES.map((quote) =>
    quote.symbol === "NVDA"
      ? { ...quote, quotedAt: "2026-09-11T14:28:00.000Z" }
      : quote,
  );
  assert.throws(
    () => buildPortfolioPlan(stocklanaDemoIntent(), ASSETS, quotes, { nowMs: NOW, maxQuoteAgeMs: 30_000 }),
    /stale quote for NVDA/,
  );
});

test("rejects mixed quote sources for the MVP execution plan", () => {
  const quotes = QUOTES.map((quote) =>
    quote.symbol === "META" ? { ...quote, source: "other" } : quote,
  );
  assert.throws(
    () => buildPortfolioPlan(stocklanaDemoIntent(), ASSETS, quotes, { nowMs: NOW }),
    /one quote source/,
  );
});

test("cent rounding remains deterministic and preserves the exact budget", () => {
  const intent = {
    currency: "USD",
    budgetUsd: 100,
    allocations: [
      { symbol: "NVDA", weightBps: 3333 },
      { symbol: "MSFT", weightBps: 3333 },
      { symbol: "META", weightBps: 3334 },
    ],
  };
  const assets = ASSETS.filter((asset) => ["NVDA", "MSFT", "META"].includes(asset.symbol));
  const quotes = QUOTES.filter((quote) => ["NVDA", "MSFT", "META"].includes(quote.symbol));
  const plan = buildPortfolioPlan(intent, assets, quotes, { nowMs: NOW });
  assert.equal(plan.allocations.reduce((sum, item) => sum + item.targetUsd, 0), 100);
});
