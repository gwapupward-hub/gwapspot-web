# GWAP MASTER

**Version:** 1.3.0  
**Status:** ACTIVE  
**Canonical location:** this directory

GWAP MASTER is the cross-system decision and evidence layer for the GWAP ecosystem.

> **Source authority + GWAP reality + explicit decision + implementation evidence + verification evidence = GWAP truth.**

External technology informs GWAP. It does not control GWAP.

## Authority order

1. Explicit Founder/product decisions.
2. Current GWAP repository and deployed-system reality.
3. Repo-local security, authority, custody, mainnet, and release gates.
4. Current official protocol/specification evidence matching the environment.
5. Pinned official upstream repositories/releases.
6. Established ecosystem documentation and audited implementation references.
7. Examples, templates, community guidance, tutorials, generated code, and curated discovery indexes.

A cross-system MASTER rule does not weaken a stronger repo-local security or Founder lock.

## System ownership

| System | Owns |
| --- | --- |
| GwapSpot / GwapOS | Public gateway, application orchestration, auth/wallet UX, integration |
| GNS / GWAP Names | .gwap identity, naming, resolution, public profile identity |
| GwapScore | Multidimensional reputation: social reputation and proof-of-control as the primary reputation surface, with Wallet Intelligence and verified GWAP ecosystem evidence as supporting inputs |
| PPV | Proof, receipts, commerce evidence, contracts/invoices; custody remains separately gated |
| Daily Ideas | Discovery, validation, projects/workspaces |
| GwapMojis | Telegram-native gifting/collectibles and Forge protocol |
| Marketplace | Economic discovery and future value-exchange layer |

## GwapScore evidence boundary

GwapScore is the canonical GWAP reputation layer. It may consume verified evidence from other GWAP systems, but those systems do not become the scoring authority.

- **Social reputation remains the primary reputation surface.** Proof-of-Control establishes ownership of external accounts; longitudinal snapshots provide observable social evidence over time.
- **Wallet Intelligence may contribute reputation evidence.** Reputation-relevant wallet history, longevity, meaningful protocol activity, consistency, verified relationships, and other explainable wallet facts may improve or lower the composite result when supported by sufficient evidence.
- **Wallet Exposure Risk remains separate.** Portfolio concentration, token-risk, volatility, liquidity, and similar exposure signals are not themselves reputation. A reputable user may hold a risky portfolio, and a conservative portfolio does not prove reputation.
- **No single source may unilaterally determine the final score.** Strong wallet evidence may materially improve a weak social result, but it must not erase contradictory or weak social evidence. The same rule applies in reverse.
- **Unavailable evidence is not zero.** Missing, inaccessible, unconnected, or temporarily unavailable evidence affects coverage/confidence rather than being fabricated as negative reputation.
- **The headline score must remain explainable.** A GwapScore result should expose its major dimensions, evidence coverage, confidence, and material reasons so users can understand why the score changed.
- **Weights are versioned model policy, not permanent architecture.** Initial component weights must be validated against real evidence distributions before being frozen; any production weight change requires a model-version bump and decision evidence.

The canonical product direction is documented in [`../GWAPSCORE_REPUTATION_MODEL_V2.md`](../GWAPSCORE_REPUTATION_MODEL_V2.md).

## Payment and value-moving boundaries

- **Stripe:** fiat checkout/subscription rail.
- **MPP / x402 + Pay / Pay Kit:** HTTP machine/API payment challenges.
- **Kora:** fee sponsorship/paymaster/trusted-signer boundary.
- **PPV:** business evidence, receipts, and commerce state around value movement.
- **Streamflow:** candidate token vesting/distribution/streaming rail; currently research/pilot-reference only.

These are complementary and must not be collapsed into one authority.

## Digital assets

Never begin with “make it an NFT.” First determine whether the user outcome requires on-chain ownership.

Compare as appropriate:
- off-chain state;
- custom program state;
- Token-2022;
- MPL Core;
- Token Metadata;
- Bubblegum/compressed assets;
- Metaplex Inscriptions after dedicated intake.

GwapMojis keeps its existing Telegram/TON Founder locks. Solana/Metaplex research does not override that repository without an explicit Founder revision.

## Protocol-sensitive decisions

For Solana claims, use:
1. observed target-cluster evidence;
2. official protocol specs;
3. exact implementation/release source;
4. SIMD design/status;
5. official developer documentation;
6. examples/community material.

Accepted or implemented does not mean activated.

## Source discovery

Curated repositories can expand our research surface without becoming trusted dependencies. `StockpileLabs/awesome-solana-oss` and Superteam OSS are treated as discovery indexes; promoted candidates receive separate intake before MASTER relies on them.

See:
- [SOURCE-AUTHORITY.md](./SOURCE-AUTHORITY.md)
- [SOLANA-OSS-DISCOVERY.md](./SOLANA-OSS-DISCOVERY.md)
- [STREAMFLOW-INTEGRATION.md](./STREAMFLOW-INTEGRATION.md)

## Third-party value protocols

A protocol being open source or audited is not sufficient for production use. Before GWAP connects a protocol that moves or locks value, verify the exact deployed identity, upgrade authority, audit scope/delta, applicable license, signer/custody boundaries, fee/oracle behavior, supported assets, failure/retry semantics, and devnet evidence.

## Release truth

For Solana programs, production-quality evidence should connect:

```text
repo commit
 -> tests
 -> deterministic/verifiable build
 -> preserved artifact
 -> executable hash
 -> deploy exact artifact
 -> on-chain hash
 -> interface/IDL evidence
 -> release record
```

IDL verification and binary verification are separate gates.

## Signer rule

A signer is not an authorization system.

```text
user/GWAP policy
 -> deterministic transaction policy
 -> construction
 -> simulation/validation
 -> signer adapter
 -> signer backend
 -> broadcast
```

User wallet, fee payer, program upgrade authority, custody authority, treasury, and agent credentials remain separate.

## Decision lifecycle

`PROPOSED -> RESEARCHED -> PILOT -> DEVNET_VERIFIED -> RELEASE_CANDIDATE -> PRODUCTION`

Terminal/alternate states: `BLOCKED`, `DEPRECATED`, `SUPERSEDED`.

## Repo-local relationship

MASTER owns **cross-system architecture and evidence routing**.

Each repository remains authoritative for its own frozen/local implementation contract where that contract is stronger and does not conflict with an explicit Founder decision. See [REPO-REGISTRY.yaml](./REPO-REGISTRY.yaml).

## Required decision fields

Material decisions should record:
- decision ID;
- owner system;
- user outcome;
- decision and rationale;
- alternatives considered;
- authoritative sources + pinned versions;
- security boundary;
- implementation;
- test/deployment evidence;
- rollback;
- review trigger;
- approval/status.
