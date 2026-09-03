# PPV Reputation Events & Receipt Credentials (v1)

PPV records factual, cryptographically verifiable events. GwapScore interprets
them. This document describes the shared trust pipeline that connects PPV,
GNS, GwapScore, the Marketplace, Daily Ideas 2.0, DIMI and GwapOS.

```
GWAP product deliverable
  -> PPV proof (ppv_core)                     chain state = truth
  -> PPV lifecycle events (emit_cpi!)
  -> normalized ReputationEventV1             app/lib/ppv-reputation/normalize.ts
  -> participant PPV receipts                 app/lib/ppv-reputation/receipts.ts
  -> GNS Verified Activity                    GET /api/ppv/activity
  -> GwapScore consumer                       GET /api/ppv/facts/:wallet
  -> optional credential NFT                  POST /api/ppv/receipts/:id/credential
```

## Contracts

The canonical contracts live in `gwapupward-hub/ppv` at `sdk/src/reputation/`
and are vendored into `app/lib/ppv-reputation/` with
`PPV_SDK_DIR=../ppv/sdk node scripts/sync-ppv-contracts.mjs` (`--check` fails
on drift). They are pure modules: no storage, no network.

| Contract | Purpose |
| --- | --- |
| `ReputationEventV1` | One normalized fact. Idempotency key: `(transactionSignature, instructionIndex, innerInstructionIndex)`. |
| `GwapDeliverableReferenceV1` | One shared deliverable interface for Marketplace, Daily Ideas and DIMI. |
| `PpvReceiptV1` | A participant's deterministic view of an event. `receiptId = H(eventId, holder, role)`. |
| `PpvSealState` | `recorded → verified → counterparty_confirmed → settled → dispute_resolved`, plus terminal `revoked`. |

Event types: `proof.created`, `proof.revoked`, `proof.submitted`,
`agreement.created`, `agreement.revised`, `agreement.signed`,
`agreement.executed`, `agreement.cancelled`, `escrow.funded`,
`milestone.created`, `milestone.delivered`, `milestone.approved`,
`milestone.rejected`, `invoice.paid`, `dispute.opened`, `dispute.resolved`,
`settlement.completed`. The custody-related types are declared ahead of the
programs that will emit them; no normalizer produces them until those
programs exist. Breaking changes get a new schema version.

`proof.submitted` is the only product-attested event. It can only be created
by `POST /api/ppv/deliverables` after the proof is re-read from chain, and it
borrows the chain coordinates of the indexed `proof.created` event, so a
resubmission collapses to one event.

## Identity

Wallet authority is canonical. A `GnsRecordSnapshotV1` is the `.gwap` name the
wallet held when the indexer first saw the event, and it is frozen with the
event (first write wins). If the name later transfers, the historical
receipts stay with the wallet that held them; `?domain=` lookups resolve the
name's *current* owner and show that wallet's history.

## Indexer

- `POST /api/ppv/webhooks/helius` — verifies HMAC-SHA256 over the raw body
  bytes (`PPV_HELIUS_WEBHOOK_SECRET`, `x-helius-signature`) before parsing.
  Fails closed when unconfigured. Accepts Helius raw or enhanced payloads,
  decodes Anchor event CPIs for the configured PPV program ids only, refuses
  PPV-shaped bytes from any other program, and ignores failed transactions.
- Every write is idempotent (`SET NX` on `eventId`; receipts are recomputed,
  never duplicated). Replaying a webhook is a no-op.
- `GET|POST /api/ppv/reconcile` — walks `getSignaturesForAddress` for both
  programs and replays anything not yet recorded. Scheduled daily in
  `vercel.json`; run on demand with `PPV_RECONCILE_WORKER_KEY`.
- If GNS is unavailable while snapshotting an identity the webhook returns
  503 so the provider retries; a wrong-forever `null` snapshot is never stored.

Storage is Redis (the existing workspace store) keyed through
`getPrivateStorageKey`. Indexes: by wallet, by GNS snapshot name, by
proof/agreement, by transaction, plus a per-wallet facts aggregate.

## Seal states

Derived by `deriveSealFacts` + `resolveSealState` from recorded events and a
chain re-read of the account. Nothing a browser sends changes them. An open
dispute does not lower the ladder; it sets `disputeOpen` and blocks minting.
"PPV Verified / Stamped & Guaranteed" means only that the displayed credential
corresponds to a verifiable PPV protocol record.

## Credential NFT

The NFT is not the proof. `POST /api/ppv/receipts/:id/credential` requires an
authenticated session whose wallet is the receipt holder, re-reads the proof
from chain, derives the seal facts, and rejects `pending`, delivered-only,
unapproved, unsettled, active-dispute, invalid-proof, invalid-receipt and
wrong-holder cases. When eligible it returns public metadata (allowlisted
keys only; `assertPublicCredentialMetadata` rejects anything else) and a
short-lived server-signed mint authorization (`PPV_CREDENTIAL_SIGNING_SECRET`).
No mint is performed automatically; the minting service is not yet connected.

## GwapScore

`GET /api/ppv/facts/:wallet` returns `ReputationFactsV1`: counts only. The
GwapScore model in `GNS-decent-deploy/wallet-intelligence` reads it through
`src/ppv/ppv-facts.client.ts` and weighs it in `src/scoring/ppv-signal.ts`.
Changing the weights bumps `MODEL_VERSION`; recorded proofs are untouched.

## Product integrations

`POST /api/ppv/deliverables` accepts one of:

- Marketplace: `{ sourceProduct: "marketplace", intentId, milestoneIndex, state: "delivered"|"accepted" }`
- Daily Ideas: `{ sourceProduct: "daily-ideas", projectId, status: "launched" }` or `{ ..., taskId, status: "done" }`
- DIMI: `{ sourceProduct: "dimi", kind: master|contribution|collaboration-deliverable|release, projectId, deliverableId, status }`

plus `proof: { ppvProofId, proofHash, counterpartyWallet? }`. Drafts and
ephemeral content are refused by the adapters. Daily Ideas project state is
verified server-side; Marketplace briefs are verified against the account's
GwapOS state; DIMI has no server-side model in this repository yet, so its
adapter enforces the finalization rule on the submitted status only.

## Tests

```
npm test            # includes app/lib/ppv-*.test.mjs
```

Covers: HMAC over raw bytes, payload parsing (raw + enhanced, failed tx,
foreign program), account decoders, duplicate webhook, out-of-order
delivery, identity transfer, multi-participant receipts, participant without
GNS, product submission idempotency, seal state via revocation, facts
aggregation, product adapters, and mint authorization signing.
