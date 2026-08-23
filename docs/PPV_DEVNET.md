# PPV in GWAP OS — Solana devnet

The Private Proof Vault surface lives at `/app/vault`. It talks to two Anchor
programs from `gwapupward-hub/ppv`: `ppv_core` (proofs) and `ppv_commerce`
(bilateral agreements).

PPV Foundation is **non-custodial and devnet-only**. It holds no funds, moves no
tokens, and has no escrow, invoicing, dispute or fee logic. Mainnet is a separate
gate, not an environment variable — the cluster is pinned in code.

## What a PPV proof does and does not prove

A PPV timestamp proves that **a wallet committed to a specific sequence of bytes
at a chain-confirmed time**.

It does not prove authorship, ownership, originality, copyright registration, or
legal validity. The UI states this; do not soften it.

The wallet signature is the authority. GNS names shown next to a proof are
**display only** and carry no authorization.

## Environment variables

| Name | Visibility | Required | Where it applies | Notes |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | public | no | local, preview, devnet | Must be `devnet` if set at all. Any other value fails startup. |
| `NEXT_PUBLIC_PPV_CORE_PROGRAM_ID` | public | **yes** | local, preview, devnet | From `deployments/devnet.json`. The protocol's build-only placeholder IDs are rejected by value. |
| `NEXT_PUBLIC_PPV_COMMERCE_PROGRAM_ID` | public | **yes** | local, preview, devnet | Same. Must differ from the core ID. |
| `NEXT_PUBLIC_PPV_RPC_URL` | public | no | local, preview, devnet | Browser-visible, so it must be intentionally public and origin/rate restricted. A URL carrying an API key or basic-auth credential is rejected at startup. Defaults to the public devnet endpoint. |
| `PPV_SOLANA_RPC_URL` | **secret** | no | preview, devnet | Server-only. May carry a provider credential. Used by the PPV verify and index routes. |

Two variables that already exist and are **not** PPV's:

- `SOLANA_RPC_URL` points at **mainnet** for Wallet Intelligence. PPV never reads
  it. Setting it does not configure PPV, and PPV must never be pointed at it.
- `NEXT_PUBLIC_SOLANA_RPC_URL` is the mainnet browser fallback for existing
  Solana features. Also not PPV's.

Rules that hold for every entry above:

- Never prefix a secret with `NEXT_PUBLIC_`. Anything so prefixed is compiled
  into the client bundle and is readable by anyone loading the page.
- No private key, seed phrase, deployer material, or upgrade-authority
  credential belongs in any environment variable. The programs' keypairs live in
  the operator secret manager and never reach this application.
- Required values are validated at startup and fail with a specific message
  naming exactly what is wrong.

## Fail-closed behaviour

Without both program IDs the vault renders an explanation and refuses to write.
There is deliberately no fallback, no demo mode, and no simulated success: every
downstream state would otherwise be indistinguishable from "nothing was recorded
on chain", which is the one thing a proof surface must never be ambiguous about.

Missing values are reported as missing. `revoked_at`, `executed_at` and
`cancelled_at` read as absent until the transition actually happens rather than
rendering as 1970, and an all-zero context hash reads as absent rather than as a
real commitment.

## Privacy

Files and agreement documents are hashed **in the browser**. The bytes are never
sent to an API, never written to Redis, and never persisted anywhere by GWAP OS.
Only the resulting SHA-256 commitments reach Solana.

The Redis index stores safe metadata only — proof id, PDA, owner wallet, content
hash, transaction signature, timestamp — as a cache. Chain state is the truth:
every write path re-reads the account on the server before trusting anything a
client sent, and the UI re-reads after every action rather than assuming a
transaction did what it was asked to do.

Reviewed document encryption is **not** part of Foundation. Do not upload
private agreements or documents.

## Journeys

**Proof.** Hash a file locally → sign `create_proof` with the verified wallet →
confirm on devnet → index safe metadata. Revoke from the Activity tab; the
program makes revocation terminal, so a second attempt is refused on chain.

**Agreement.** Draft content and terms → both canonicalized and hashed locally →
sign `create_agreement` naming the counterparty and an expiry → each party signs
the exact current version and both hashes → the program marks it Executed once
both current signatures are present.

Proposing a revision clears both signatures. That is the point: a signature names
one exact version and both hashes, so anything that changes either invalidates
prior consent. A stale signature is rejected by the program, and the panel says
which version the signer was on.

Terminal states — Executed and Cancelled — cannot be mutated.

## Operational health check

```bash
solana program show "$PPV_CORE_PROGRAM_ID"     --url https://api.devnet.solana.com
solana program show "$PPV_COMMERCE_PROGRAM_ID" --url https://api.devnet.solana.com
```

Healthy means both accounts are executable, both upgrade authorities match the
Squads vault PDA recorded in the protocol repo's `deployments/devnet.json`, and
`/app/vault` can fetch a known proof account.

**An upgrade authority that does not match the manifest is a security incident,
not configuration drift.**

In the app: open `/app/vault`, confirm the persistent `DEVNET` indicator, and
load a known agreement by creator wallet and id. If the vault shows a
configuration error instead, the program IDs are unset or invalid — read the
message, it names the variable.

## Known limitations

- Devnet state is not durable. Devnet is periodically reset; proofs and
  agreements can disappear. This surface is for design partners only.
- Proof accounts are namespaced by authority, so a proof id alone does not
  identify one. Verifying someone else's proof needs the wallet that created it.
- No funds, tokens, escrow, invoicing, disputes, or fees. Foundation is
  non-custodial by design and none of that may be added under this gate.

## Gates

See `docs/deployment-gates.md` in `gwapupward-hub/ppv` for the full F1/F2/F3
criteria. F3 requires an independent Solana security review with all critical and
high findings remediated before any production candidate.
