# GwapScore Reputation Model v2

**Status:** CANONICAL PRODUCT DIRECTION — IMPLEMENTATION PENDING  
**Founder decision:** `GWAP-REPUTATION-001`  
**Canonical scale:** 300–900

## Purpose

GwapScore is GWAP's multidimensional reputation system. Social reputation and social Proof-of-Control remain the primary reputation surface, while reputation-relevant Wallet Intelligence and verified GWAP ecosystem evidence may contribute to the final result.

The objective is not to collapse every signal into one opaque number. The 300–900 score is a shorthand for an explainable reputation profile whose underlying dimensions, evidence coverage, confidence, provenance, and material reasons remain inspectable.

## Product boundary

GwapScore owns interpretation and scoring.

Other systems provide facts:

- **GWAP Public Proof** proves control of external social accounts.
- **GwapScore Snapshot** records longitudinal public social observations.
- **Wallet Intelligence** provides reputation-relevant wallet facts.
- **GNS** provides identity and wallet/name relationships.
- **PPV** provides cryptographically verifiable proof and commerce facts.
- **Other GWAP products** may provide versioned, verified reputation events in the future.

These evidence producers do not assign the final GwapScore.

## Reputation dimensions

### 1. Social Reputation

Primary surface. Candidate evidence includes:

- verified control of external accounts;
- longitudinal account history;
- account longevity when independently available;
- activity consistency;
- public engagement evidence;
- repeated observations over time;
- authenticity/manipulation signals that can be supported by explicit evidence.

Proof-of-Control is an entry condition and provenance fact. Verification by itself is not equivalent to a high reputation score.

### 2. Wallet Reputation

Supporting surface derived only from reputation-eligible Wallet Intelligence evidence. Candidate evidence includes:

- wallet longevity;
- sufficient transaction history;
- consistent on-chain participation;
- meaningful protocol usage;
- verified wallet relationships;
- durable activity across time;
- explainable behavioral facts that are relevant to reliability or established participation;
- verified PPV/GWAP activity associated with the wallet when sourced through the appropriate evidence contract.

A strong wallet may materially improve the composite GwapScore of a user with weak social evidence. It must not erase contradictory social evidence or convert an unverified social identity into a verified one.

### 3. Identity / Proof Confidence

Candidate evidence includes:

- authenticated wallet control;
- `.gwap` identity relationships;
- verified social-account bindings;
- stable external account identifiers;
- provenance quality and freshness;
- cross-source identity consistency.

Identity confidence measures confidence in the subject/evidence relationship. It must not be treated as a substitute for reputation behavior.

### 4. GWAP Ecosystem Reputation

Candidate future evidence includes:

- PPV factual receipts;
- completed/settled verified interactions;
- accepted deliverables;
- verified contribution history;
- other versioned GWAP reputation facts with explicit provenance.

Product-local vanity metrics or unverified client assertions are not reputation evidence.

## Wallet Intelligence eligibility boundary

Wallet Intelligence is broader than GwapScore. Only a documented, versioned subset of Wallet Intelligence fields may enter the reputation model.

A wallet signal is eligible only when it is:

1. relevant to reputation rather than investment preference;
2. explainable to the user;
3. based on observable evidence;
4. provenance-bearing;
5. robust against temporary provider failure;
6. tested for obvious gaming/manipulation paths;
7. explicitly registered in the scoring model version.

### Wallet Exposure Risk is excluded from reputation

Wallet Exposure Risk remains a separate product signal.

The following must not directly raise or lower GwapScore merely because they indicate portfolio risk:

- portfolio concentration;
- token volatility;
- liquidity exposure;
- drawdown exposure;
- speculative asset selection;
- price-coverage limitations;
- similar investment-risk characteristics.

A reputable person may hold a high-risk portfolio. A conservative portfolio does not prove reputation.

## Composite scoring contract

Each active dimension produces at minimum:

```ts
type ReputationDimension = {
  key: "social" | "wallet" | "identity" | "ecosystem";
  score: number | null;       // normalized internally, never fabricated
  confidence: number;         // 0..1
  coverage: number;           // 0..1
  evidenceCount: number;
  reasons: string[];
  provenance: EvidenceRef[];
};
```

The production model must combine dimensions using versioned base weights and evidence confidence rather than a fixed unqualified average.

Conceptually:

```text
adjusted_weight_i = base_weight_i × confidence_i

composite_normalized =
  Σ(dimension_score_i × adjusted_weight_i)
  ─────────────────────────────────────────
             Σ(adjusted_weight_i)

GwapScore = 300 + round(600 × composite_normalized)
```

This formula is a model contract, not authorization to freeze weights without calibration. Dimension transforms, caps, thresholds, minimum evidence requirements, and confidence functions belong to a versioned model specification and tests.

## Weight policy

The architectural rule is:

- Social Reputation remains the largest single base-weighted reputation surface.
- Wallet Reputation is a material supporting input.
- Identity/Proof and GWAP ecosystem evidence may strengthen the result without replacing behavioral reputation.
- No individual evidence source may receive enough production weight to silently override the remaining evidence domains.

A useful **calibration starting point**, not a frozen production commitment, is:

| Dimension | Candidate starting weight |
| --- | ---: |
| Social Reputation | 45% |
| Wallet Reputation | 30% |
| Identity / Proof | 15% |
| GWAP Ecosystem Reputation | 10% |

These percentages must not be treated as protocol law. Snapshot distributions, wallet-intelligence distributions, manipulation tests, edge cases, and user-impact analysis must be evaluated before production weights are frozen.

Any material production weight change requires:

- a `MODEL_VERSION` bump;
- updated fixtures/tests;
- documented rationale;
- regression comparison against prior model output;
- MASTER decision evidence when the change alters architecture or product policy.

## Coverage and confidence

### Unavailable is never zero

Missing evidence must never be silently converted to negative reputation.

Examples:

- no connected wallet → wallet dimension unavailable, not `0`;
- X API outage → affected social metrics unavailable, not `0`;
- provider timeout → confidence/coverage reduction, not reputation punishment;
- unsupported field → unavailable with an explicit reason.

### Coverage is separate from score

A result must communicate both reputation and how much evidence supports it.

Example:

```text
GwapScore: 785 — Strong
Coverage: 61%
Confidence: Medium
```

is materially different from:

```text
GwapScore: 785 — Strong
Coverage: 94%
Confidence: Very High
```

### Full composite vs limited-coverage result

A single evidence domain must not masquerade as a broadly corroborated reputation profile.

The v2 implementation should distinguish:

- **composite/scored** — sufficient independent evidence domains meet the model's minimum requirements;
- **limited coverage** — a score estimate may be available, but too few independent domains exist for full confidence;
- **unscored** — insufficient evidence for a defensible result;
- **unavailable** — scoring dependencies failed or could not be reached.

Minimum-domain requirements are model-version policy and must be empirically calibrated.

## Conflicting evidence

Strong evidence in one dimension may improve the final result without erasing weakness elsewhere.

Example:

```text
Social Reputation: weak
Wallet Reputation: excellent
Identity Confidence: high
Overall GwapScore: established/strong depending on calibrated model
```

The output must preserve the weak social dimension rather than presenting the wallet as proof that the social reputation is also strong.

Contradictory evidence should first affect confidence and produce an explanation/flag. It should only lower a reputation dimension when the scoring model has an explicit, evidence-backed rule mapping that fact to negative reputation.

## Explainability requirements

Every scored response should be able to provide:

- final 300–900 score;
- tier;
- model version;
- dimension results;
- coverage;
- confidence;
- major positive contributors;
- major negative contributors;
- unavailable evidence and reasons;
- provenance references sufficient for internal audit;
- score timestamp / evidence-window timestamps.

The UI may summarize this information, but the underlying model output must preserve it.

## Existing 300–900 tiers

Until explicitly revised, the existing canonical tier ranges remain:

| Score | Tier |
| ---: | --- |
| 300–499 | High Risk |
| 500–599 | Developing |
| 600–699 | Established |
| 700–799 | Strong |
| 800–900 | Elite |

Tier naming may be reviewed separately because the term `High Risk` can be confused with Wallet Exposure Risk. A rename must not be bundled silently into the v2 scoring migration.

## Migration from the legacy score

The current deployed GwapScore implementation still contains legacy on-chain-history assumptions. This document does not claim that v2 is already deployed.

Migration must:

1. inventory the current scoring-service inputs and model version;
2. separate reputation-eligible Wallet Intelligence from Wallet Exposure Risk;
3. preserve the existing 300–900 external contract unless a separate approved migration changes it;
4. add dimension-level output, coverage, confidence, and explanations;
5. integrate verified social snapshot evidence only after sufficient real longitudinal data exists;
6. calibrate candidate weights against observed distributions;
7. test low-social/high-wallet, high-social/low-wallet, missing-wallet, missing-social, conflicting-evidence, provider-failure, and manipulation scenarios;
8. version the new model;
9. compare legacy and v2 outputs before release;
10. ship behind an explicit release gate/feature flag until validated.

## Required acceptance scenarios

At minimum, the implementation must prove these behaviors:

1. **Low social + excellent wallet:** wallet evidence materially improves the final result, while the weak social dimension remains visible.
2. **Excellent social + weak wallet:** strong social reputation remains meaningful; wallet weakness affects only rules explicitly tied to reputation.
3. **No wallet connected:** missing wallet evidence does not become zero; coverage/confidence reflect the gap.
4. **No social account verified:** wallet evidence may be represented, but the result cannot falsely imply verified social reputation.
5. **API/provider outage:** unavailable inputs do not lower the score as if observed negative evidence existed.
6. **Risky portfolio + reputable history:** Wallet Exposure Risk may be high while GwapScore remains strong.
7. **Contradictory evidence:** dimensions and confidence expose the conflict rather than allowing one source to hide it.
8. **Model-version change:** the same evidence can be reproduced against a pinned model version for audit/regression analysis.

## Non-goals

GwapScore v2 is not:

- a credit score;
- a lending underwriting score;
- a portfolio-risk score;
- proof of legal identity;
- proof that a user is safe to transact with in every context;
- permission to expose private wallet/social information;
- a mechanism for converting inaccessible data into negative reputation.

## Related documents

- `docs/master/README.md`
- `docs/master/DECISION-REGISTRY.yaml`
- `docs/GWAP_PUBLIC_PROOF.md`
- `docs/GWAPSCORE_SNAPSHOT_V1.md`
- `docs/wallet-risk-model.md`
- `docs/GWAP_INTELLIGENCE_API.md`
- `docs/PPV_REPUTATION_RECEIPTS.md`
