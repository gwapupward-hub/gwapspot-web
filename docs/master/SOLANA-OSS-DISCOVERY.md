# Solana OSS Discovery Intake

## StockpileLabs awesome-solana-oss

**Source:** https://github.com/StockpileLabs/awesome-solana-oss  
**Reviewed:** 2026-10-02  
**Pinned catalog commit:** `c707998854f8a3491f05f07d0f1119e371439ec3`  
**Classification:** `REFERENCE_ONLY / DISCOVERY_INDEX`

### Rule

`awesome-solana-oss` is useful for discovering relevant Solana open-source projects. It is **not** implementation authority and does not grant transitive trust to repositories it lists.

Every repository discovered through this catalog must still receive its own intake covering maintenance, exact revision, license, audit/security posture, compatibility, authority implications, and concrete GWAP use.

## Superteam OSS

**Source:** https://oss.superteam.fun/  
**Reviewed:** 2026-10-02  
**Classification:** `REFERENCE_ONLY / COMMUNITY_DISCOVERY_INDEX / DYNAMIC_CATALOG`

Superteam OSS is a broad community directory of Solana open-source projects. It is useful for discovering patterns and projects, but it is not implementation authority and cannot be pinned to one immutable Git revision like a repository.

### Dynamic catalog rule

For dynamic catalogs:

1. record the review date/time;
2. follow each candidate to its canonical repository/source;
3. identify current owner, default branch, release/version, and maintenance state;
4. pin the exact candidate commit/tag/version independently;
5. inspect license, audit/security posture, dependencies, authority assumptions, and compatibility;
6. compare the candidate against current MASTER authorities and working GWAP architecture;
7. classify the candidate independently before adoption.

The directory's inclusion decision never transfers trust to the listed project.

### Freshness gate

Superteam OSS includes useful current work alongside older Solana patterns and historical projects. A listed project must not become a modern default merely because it appears in the directory.

Before adopting a candidate, check whether it relies on superseded or legacy assumptions such as:

- deprecated Web3.js-era scaffolding where newer Solana Kit patterns are now preferred;
- xNFT-era architecture that is no longer a current GWAP requirement;
- Candy Machine v2 or other older Metaplex defaults;
- abandoned or archived payment experiments;
- stale wallet, RPC, transaction-format, or Token-2022 assumptions.

### Security gate

Community examples may intentionally trade security for convenience. GWAP must not inherit those tradeoffs without explicit approval.

In particular, production wallet/private-key material must never be stored in browser `localStorage`, browser cache, or similar client persistence simply because a listed sample uses a burner/hot-wallet pattern.

### Useful Superteam watch areas

These remain discovery leads until a concrete GWAP feature requires dedicated intake:

- passkey-based wallet/session UX;
- mobile wallet interoperability;
- wallet monitoring and transaction-intent safety;
- on-chain 2FA / transaction-policy patterns;
- treasury, vesting, payroll, and token-distribution tooling;
- new developer tooling that closes a gap not already covered by current MASTER sources.

## Promoted sources

### 1. Anza Agave

- Repository: https://github.com/anza-xyz/agave
- Reviewed commit: `1aacad23439911e249a28beaf7e8bb3dd5b44dc4`
- License: Apache-2.0
- Classification: `ADOPTED_REFERENCE`
- Use: release-level/runtime implementation evidence when the normative Solana specs are insufficient to explain exact behavior in a particular Agave release.

**Boundary:** Solana protocol specs remain the normative source. Agave source explains concrete implementation behavior and release details; it does not replace target-cluster activation evidence.

### 2. Anza Kit

- Repository: https://github.com/anza-xyz/kit
- Reviewed commit: `de1c63fb02528ed75428713c8f608a8133883afd`
- License: MIT
- Classification: `ADOPTED_REFERENCE`
- Use: current JavaScript Solana SDK implementation/reference for GwapOS client work.

**Boundary:** GwapOS currently has working wallet/auth/client abstractions. Kit upstream direction is not authorization for a whole-app rewrite or dependency upgrade. Prefer incremental compatibility work behind existing boundaries.

### 3. Anza Wallet Adapter

- Repository: https://github.com/anza-xyz/wallet-adapter
- Reviewed commit: `5f33bc6017dfc05ed0e3e4f69a631bbcad6c7973`
- License: Apache-2.0
- Classification: `ADOPTED_REFERENCE_ONLY`
- Use: wallet capability/interoperability reference where GwapOS needs behavior beyond the current Privy/Phantom integration.

**Boundary:** Do not introduce a second wallet-state framework merely because Wallet Adapter is available. Compare against current Privy/session/network behavior first.

### 4. Codama

- Repository: https://github.com/codama-idl/codama
- Reviewed branch: `1.x`
- Reviewed commit: `a329ab8ab6d569fdd115235e2ffdfd791c5dc3d2`
- License: MIT
- Classification: `ADOPTED_REFERENCE`
- Use: IDL normalization, generated clients, documentation/tooling, and interoperability checks.

Codama is particularly relevant to GNS, which already generates SDK clients from IDLs.

**Supply-chain rule:** Codama visitors/scripts are executable tooling. External visitors do not inherit Codama's trust level; pin and review each added visitor/package before use. Do not let generated clients silently change protocol semantics.

### 5. Trident

- Repository: https://github.com/Ackee-Blockchain/trident
- Reviewed commit: `053656638bfcbbd7951799f3a6b81f85cf55fac0`
- Observed documented release: `0.11.1`
- License: MIT
- Classification: `PILOT_REFERENCE`
- Use: stateful/manually guided fuzzing, property testing, transaction-flow exploration, and regression testing for Solana programs.

**Pilot targets:** PPV first, then GNS if the PPV pilot demonstrates useful coverage beyond the current property/invariant suites.

**Rollout:** existing unit/property tests -> isolated Trident pilot -> compare findings/runtime/reproducibility -> optional release-tier addition.

Do not replace proven PPV tests or make Trident mandatory CI until the pilot demonstrates net value and reproducibility with the repo's pinned Anchor/Solana toolchain.

### 6. Lighthouse

- Repository: https://github.com/Jac0xb/lighthouse
- Reviewed commit: `4c579479c98635e419b1b167f08be02a71604a71`
- License: MIT
- Classification: `REFERENCE_ONLY`
- Use: assertion-pattern reference for transaction safety, especially where current Kora behavior explicitly supports Lighthouse assertions.

**Caution:** the repository's latest observed push predates this intake by more than a year. Do not add a new direct dependency without a fresh compatibility/security review. The Kora-specific limitations already recorded in MASTER remain authoritative for Kora flows.

## Useful catalog entries not promoted yet

These stay as discovery leads until a concrete GWAP feature needs them:

- Firedancer, Jito Solana, Sig, Mithril, Salsa — validator/client diversity and implementation research.
- Mollusk, LiteSVM, Seashell, svm-unit-test — testing alternatives/adjuncts; current testing stack already has Surfpool plus repo-local suites.
- Yellowstone gRPC, Carbon, Vixen — indexing/streaming candidates when GNS/PPV data volume requires a new ingestion architecture.
- Squads v4 — already relevant to authority governance; intake should remain tied to the exact repo/tool used by PPV/GNS.
- DeFi protocols such as Kamino, Orca, Raydium, Meteora, Manifest — product-specific integration references, not MASTER defaults.
- qedsvm, sol-azy and specialized cryptography projects — security research leads requiring dedicated intake before use.

## Discovery-source policy

A curated list can answer **"what should we inspect?"**. It cannot answer **"what should GWAP trust or install?"**.

For any future curated list:

1. pin the list revision when possible; otherwise record a review timestamp;
2. mark it `DISCOVERY_INDEX`;
3. extract only candidates connected to an active GWAP problem;
4. run each promoted candidate through normal intake;
5. never inherit license, audit, maintenance, or security claims transitively;
6. record whether the candidate is adopted, pilot-only, reference-only, rejected, or superseded.

## Re-review triggers

Re-review this intake when:

- either discovery catalog adds a tool directly relevant to an active GWAP subsystem;
- GwapOS changes Solana client architecture;
- PPV/GNS change their testing toolchains;
- GNS changes its Codama generation pipeline;
- Kora changes Lighthouse support;
- a promoted repository becomes archived, changes ownership/license, or has a major security event.
