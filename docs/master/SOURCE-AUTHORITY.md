# Source Authority and Intake

## Governing rule

Do not treat repositories as equal authorities. First identify whether a source is a protocol specification, canonical implementation, SDK, tool, mirror/fork, template, example, ecosystem directory, or historical reference.

## Solana routing

- Protocol semantics: Solana `specs`.
- Change proposals/lifecycle: SIMDs.
- Cluster availability: feature activation + observed cluster state.
- Current developer direction: `solana-dev-skill`.
- Realistic integration simulation: Surfpool.
- Deployment provenance: Solana Verifiable Builds.
- Signers: `solana-keychain` with audit-scope/delta review.
- Fee sponsorship: Kora.
- Agentic HTTP payments: MPP specs -> Pay Kit / Pay.
- Interface metadata: IDL spec + IDL tooling.
- Transaction-v1 compatibility: transaction-v1 examples.
- Current docs lookup: official Solana MCP.

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
- REJECTED
- SUPERSEDED

Every adopted source needs a pinned revision and re-review trigger.
