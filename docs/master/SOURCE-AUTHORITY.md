# Source Authority and Intake

## Governing rule

Do not treat repositories as equal authorities. First identify whether a source is a protocol specification, canonical implementation, SDK, tool, mirror/fork, template, example, ecosystem directory, historical reference, or discovery index.

## Solana routing

- Protocol semantics: Solana `specs`.
- Change proposals/lifecycle: SIMDs.
- Cluster availability: feature activation + observed cluster state.
- Exact validator/runtime implementation behavior: Anza `agave`, matched to the target release.
- Current developer direction: `solana-dev-skill`.
- Current JavaScript SDK implementation/reference: Anza `kit`.
- Wallet interoperability reference: Anza `wallet-adapter`, only where needed by the existing Privy/session architecture.
- Realistic integration simulation: Surfpool.
- Security fuzzing candidate: Trident, currently pilot-only.
- Deployment provenance: Solana Verifiable Builds.
- Signers: `solana-keychain` with audit-scope/delta review.
- Fee sponsorship: Kora.
- Agentic HTTP payments: MPP specs -> Pay Kit / Pay.
- Interface metadata: IDL spec + IDL tooling.
- IDL normalization/client generation: Codama, with separate intake for executable visitors/renderers.
- Transaction-v1 compatibility: transaction-v1 examples.
- Current docs lookup: official Solana MCP.
- Curated OSS discovery: `StockpileLabs/awesome-solana-oss` and `https://oss.superteam.fun/`, discovery only; see [SOLANA-OSS-DISCOVERY.md](./SOLANA-OSS-DISCOVERY.md).
- Token vesting/distribution/streaming evaluation: Streamflow active SDKs, subject to license, audit-scope, deployment-authority, and compatibility gates; see [STREAMFLOW-INTEGRATION.md](./STREAMFLOW-INTEGRATION.md).

## Discovery indexes

Curated lists and ecosystem indexes answer **what should we inspect?**, not **what should we trust?**

A repository listed by a discovery index receives no transitive authority, security, license, audit, compatibility, or maintenance approval. Any candidate promoted into MASTER must go through its own intake and receive a pinned revision plus explicit classification.

Dynamic web catalogs that cannot be pinned to a Git commit must record a review timestamp and route every candidate to its canonical source before classification.

## Third-party financial / value-moving protocols

A third-party protocol that moves, locks, vests, sponsors, settles, or controls value receives no production approval merely because it is open source, audited, popular, or listed by an ecosystem directory.

Before production use, verify at minimum:

- canonical current source and pinned SDK/release;
- exact deployed program/contract identity;
- upgrade/admin authority;
- audit scope and code/deployment delta;
- license obligations;
- fees and oracle dependencies;
- signer/custody/treasury boundaries;
- supported assets and token extensions;
- retry/idempotency/failure behavior;
- local/devnet evidence;
- rollback/kill switch.

## Metaplex routing

The old `metaplex-foundation/metaplex` repo is an ecosystem directory, not current implementation authority.

Resolve implementation to current dedicated repos such as MPL Core, Token Metadata, or Bubblegum, and check the exact target license/audit/program version before adoption.

## Intake classifications

Use one of:
- ADOPTED
- PILOT
- PILOT_DEVNET_ONLY
- ADOPTED_REFERENCE
- ADOPTED_REFERENCE_ONLY
- PILOT_REFERENCE
- MIGRATION_REFERENCE
- REFERENCE_ONLY
- HISTORICAL_REFERENCE_ONLY
- REJECTED
- SUPERSEDED

A source may also carry a role such as `DISCOVERY_INDEX`; the role does not increase its authority tier.

Every adopted source needs a pinned revision and re-review trigger.
