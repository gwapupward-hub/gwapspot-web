# GWAP Wallet Exposure Risk v1

Wallet Exposure Risk is a deterministic portfolio-risk signal and is intentionally separate from GwapScore reputation.

## Scale

- 0–19: Low
- 20–44: Moderate
- 45–69: Elevated
- 70–100: High

Higher means more portfolio exposure risk.

## Current signals

- priced-portfolio concentration
- explicitly unverified token exposure
- low Jupiter organic-score exposure
- low-liquidity exposure
- sharp 24-hour drawdown exposure
- limited reliable price coverage

Signals are threshold-based and return the points and evidence used. Missing data lowers confidence or produces insufficient-data status rather than a fabricated safe result.

## GwapScore boundary

Wallet Intelligence may provide a documented subset of reputation-relevant wallet evidence to GwapScore. Wallet Exposure Risk is not part of that subset and does not directly raise or lower the 300–900 reputation score.

Potential reputation-eligible Wallet Intelligence evidence can include wallet longevity, sufficient transaction history, consistent participation, meaningful protocol usage, verified relationships, and other explainable behavioral facts registered by the scoring model.

Portfolio characteristics such as concentration, volatility, liquidity exposure, drawdown, asset selection, and price-coverage gaps remain separate from reputation.

```text
Wallet Intelligence
  -> reputation-eligible evidence subset
  -> GwapScore

Wallet Exposure Risk
  -> separate portfolio-risk result
```

See `GWAPSCORE_REPUTATION_MODEL_V2.md` for the canonical composite reputation policy.

## Non-goals

This model does not make identity or reputation judgements and does not directly modify the canonical GwapScore 300–900 reputation model.
