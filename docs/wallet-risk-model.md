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

## Non-goals

This model does not claim that an unverified token is fraudulent, does not infer criminality or identity risk, and does not modify the canonical GwapScore 300–900 reputation model.
