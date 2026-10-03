# Streamflow Finance Intake

**Organization:** https://github.com/streamflow-finance  
**Reviewed:** 2026-10-02  
**MASTER classification:** `PILOT_REFERENCE / DISTRIBUTION_AND_VESTING_RAIL`

## Executive decision

Streamflow is relevant to GWAP as a **token distribution, vesting, timelock, and future payroll/streaming rail**. It does **not** replace PPV, Kora, Stripe, MPP/x402, or GWAP's wallet/auth boundaries.

Recommended boundary:

```text
GwapOS / product workflow
  -> GWAP authorization + policy
  -> Streamflow adapter/service boundary
  -> Streamflow vesting/distribution protocol

PPV
  -> proof / receipts / contracts / invoices / commerce evidence

Kora
  -> fee sponsorship / trusted signer boundary

Stripe
  -> fiat checkout / subscription rail
```

Do not collapse these responsibilities.

## Canonical repositories reviewed

### JavaScript SDK

- Repository: https://github.com/streamflow-finance/js-sdk
- Reviewed commit: `fb236fff325ab02d7ff5d0ff5e393be8934cda9d`
- Latest observed stable release during intake: `v13.4.0`
- Active, non-archived
- Core packages include Streamflow streams/vesting and distributor/airdrop support.
- Current stream package depends on Anchor `^0.32.1`, `@solana/web3.js` `1.98.4`, SPL Token `0.4.9`, and Wallet Adapter.
- Classification: `REFERENCE_ONLY / FUTURE_APP_SERVICE_PILOT / LEGAL_REVIEW_REQUIRED`

### JavaScript licensing gate

The JS repository has conflicting license signals at the reviewed revision:

- root `package.json`: `AGPL-3.0-or-later`;
- repository-detected license / root LICENSE content: GPL-3.0.

Because the exact licensing obligation for the published package must be clear before production distribution, GWAP must **not** add the JS SDK as a production dependency until the package's applicable license is confirmed and compatible with GWAP's distribution model.

Pattern-level research and protocol evaluation are allowed. Copying implementation code or shipping the package requires legal/license review.

### Rust SDK

- Repository: https://github.com/streamflow-finance/rust-sdk
- Reviewed commit: `63df7d7b831340daa27f31d007eec2a98380364c`
- Observed SDK version: `0.15.0`
- Package declares MIT
- Active, non-archived
- Supports CPI from Solana programs into Streamflow.
- Includes V1 signer-metadata and V2 PDA-metadata creation variants.
- Mainnet program ID documented by upstream: `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m`.
- Classification: `ADOPTED_REFERENCE_ONLY / FUTURE_CPI_PILOT`

### PPV compatibility gate

The reviewed Rust SDK requires:

```text
anchor-lang >=0.32.1,<1
anchor-spl  >=0.32.1,<1
```

PPV is intentionally pinned to Anchor `0.30.1` today.

Therefore:

- do not add Streamflow CPI directly to PPV now;
- do not upgrade PPV's Anchor/Solana/Rust toolchain solely to consume Streamflow;
- if a future PPV feature genuinely requires Streamflow CPI, evaluate the toolchain migration independently first;
- prefer an app/service-layer proof of value before any protocol-level coupling.

### Deprecated program repository

- Repository: https://github.com/streamflow-finance/streamflow-program
- Upstream description explicitly marks it `(deprecated)`.
- Archived; latest observed push is from 2023.
- Classification: `HISTORICAL_REFERENCE_ONLY`

Do not use this archived repository as current protocol implementation authority.

## Security posture

The active SDK repositories link protocol and partner-oracle audit reports. Their presence is useful evidence, but MASTER has **not yet completed an audit-scope review** for production adoption.

Before a production Streamflow integration, verify:

1. exact deployed program IDs per cluster;
2. program upgrade authority / governance model;
3. exact audit reports, auditor, date, scope, findings, and remediations;
4. which program revision/commit the audit actually covered;
5. whether current deployed code changed after the audited revision;
6. SDK release compatibility with the deployed program;
7. fees, fee oracle behavior, partner fee routing, and failure semantics;
8. cancellation, transferability, pausing, top-up, and rate-update permissions;
9. Token-2022 compatibility and unsupported token extensions;
10. duplicate/retry/idempotency behavior in GwapOS;
11. user authorization and signing UX;
12. devnet/local scenario tests before value-bearing use.

An upstream `Security audit passed` statement is not sufficient by itself to grant production approval.

## Best GWAP use cases

Potential uses, in priority order:

1. **Team/advisor token vesting** — deterministic unlock schedules for future GWAP-issued Solana assets.
2. **Grant/contributor distributions** — structured unlocks tied to contributor or ecosystem programs.
3. **Partner allocations** — controlled token distributions without inventing a new vesting protocol.
4. **Payroll/stream-style token compensation** — only after legal, accounting, treasury, and UX requirements are defined.
5. **Large token distributions/airdrops** — evaluate the distributor package when a concrete campaign requires it.

Do not implement token vesting merely because Streamflow exists. A concrete GWAP asset and economic policy must exist first.

## Relationship to PPV

Streamflow moves/unlocks tokens according to distribution rules. PPV records and proves business state and evidence.

A future composition could be:

```text
GWAP agreement / milestone
 -> PPV records agreement/evidence
 -> authorized distribution policy evaluates
 -> Streamflow creates or updates vesting stream
 -> PPV stores resulting reference/receipt/proof
```

That composition requires a separate design review. PPV must not silently gain custody or automatic treasury authority through the integration.

## Pilot recommendation

When GWAP has a real vesting/distribution need:

1. define one concrete user outcome;
2. choose devnet only;
3. verify current Streamflow program IDs and deployment authority;
4. complete audit-scope review;
5. resolve JS SDK licensing before shipping it;
6. prefer a server/app adapter rather than PPV CPI initially;
7. use a low-value test mint;
8. test create, withdraw, cancel, transfer, pause, top-up, update-rate/name, retry, and failure paths applicable to the chosen product;
9. preserve signer/treasury/user-wallet separation;
10. add structured receipts/evidence to PPV only if the product needs them;
11. add a kill switch / feature flag;
12. promote only after devnet evidence is recorded.

## Status

`RESEARCHED / NOT_PRODUCTION_APPROVED`

Primary blockers for production adoption:

- no concrete GWAP vesting/distribution launch requirement yet;
- JS SDK license ambiguity must be resolved before production dependency use;
- audit scope/current deployment delta has not been independently reviewed;
- PPV Anchor 0.30.1 is incompatible with the current Rust SDK's Anchor >=0.32.1 requirement.

## Re-review triggers

Re-review when:

- GWAP defines a token vesting, grant, payroll, contributor, or airdrop feature;
- Streamflow releases a new major SDK/protocol version;
- Streamflow changes program IDs or upgrade authority;
- the JS SDK license is clarified/changed;
- PPV deliberately evaluates an Anchor toolchain upgrade;
- an audit/security incident or new audit materially changes the risk profile.
