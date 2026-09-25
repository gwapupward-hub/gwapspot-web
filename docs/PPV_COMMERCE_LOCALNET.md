# PPV Commerce localnet acceptance

This workflow is the GwapSpot-side localnet gate for PPV Commerce. It is intentionally **manual only** so Anchor/Solana builds do not consume CI time on every web pull request.

## What it proves

The workflow checks out the pinned PPV package commit:

`7c4ea67a9b6d69ab85a20f497eb0c2a31b48cfd2`

It then uses PPV's own ephemeral-program-id fixture flow, builds the programs with the pinned toolchain, starts a private `solana-test-validator`, deploys/tests the PPV programs, and runs GwapSpot's vendored SDK builders and account decoders against that same validator.

The GwapSpot acceptance harness covers:

- **C01** — two different wallets sign the same current version and exact content/terms hashes before execution;
- **C02** — a revision increments the version and clears prior signatures;
- **C03** — stale signatures and stale revisions are rejected after a version change;
- **C04** — the application-level Commerce → Escrow binding refuses content/terms, role, amount, mint, or schedule drift;
- Core ↔ Commerce binding — a Core proof can commit to the same Commerce terms hash and exact agreement address.

The report contains the localnet genesis, ephemeral program IDs, fixture account addresses, transaction signatures and assertion results.

## What it does not claim

This does **not** enable Commerce on public devnet. The canonical Commerce devnet program is still absent, so production GwapOS must continue to report Commerce as unavailable.

This does **not** enable Escrow custody. The production Escrow binary remains mutation-blocked until its separate security/deployment gates are satisfied.

This does **not** prove a Privy/Phantom localnet wallet UX. Privy's standard Solana send flow targets supported Solana clusters; this gate validates GwapSpot's semantic transaction builders, canonical hashing, account decoding and binding rules against a real local validator. Public-devnet wallet acceptance remains a separate stage after Commerce is deployed.

## Run

In GitHub Actions, run:

`PPV Commerce Localnet Acceptance → Run workflow`

The workflow is `workflow_dispatch` only.

For a developer-owned validator, the same harness can be run directly after Core and Commerce are deployed locally:

```bash
PPV_LOCALNET_RPC_URL=http://127.0.0.1:8899 \
PPV_LOCALNET_CORE_PROGRAM_ID=<local-core-id> \
PPV_LOCALNET_COMMERCE_PROGRAM_ID=<local-commerce-id> \
npm run test:ppv:commerce:localnet
```

The generated evidence is written to `artifacts/ppv-commerce-localnet-report.json`.
