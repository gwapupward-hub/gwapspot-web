# GWAP Messenger — PostgreSQL Per-Envelope Authorization and Recipient Sync Sprint

**Date:** November 17, 2026  
**Branch:** `test/gwap-messenger-postgres-envelope-ds-20261117`  
**Canonical tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341  
**Verified GitHub Actions run:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44194864351

## Outcome

**PASS (disposable PostgreSQL 16 and generated Ed25519 fixtures only).** All **36/36 CI tests** passed: 14 existing durable checkpoint cases, 6 existing signed localhost checkpoint API cases, and 16 new PostgreSQL envelope/recipient authorization cases. No production implementation is approved.

## What changed

- `openmls-poc/checkpoint/pg-envelope-schema.sql` extends the existing checkpoint schema with test-only group membership, signed envelope authorization grants, opaque byte deliveries and recipient pull nonces.
- `openmls-poc/checkpoint/pg-envelope-ds.mjs` uses the existing `messenger_checkpoint_devices` table as the single authoritative device revision/binding/fence store. The grant and its ratchet snapshot revision advance **in the same PostgreSQL transaction** under row locks.
- Each authorization cryptographically binds device, stable account, binding version, fence, prior/new revision, snapshot commitment, group, recipient device, message ID, epoch, ciphertext hash, and idempotency key; the server produces a signed, bounded grant receipt.
- A subsequent delivery must present a fresh device-signed intent matching the exact granted envelope and actual opaque bytes. The server checks sender and recipient status, active fixture group membership, grant expiration, signed fields, ciphertext hash, and current durable fencing before storing. A grant created at an older revision may remain usable after the device advances, while the original fence and identity remain valid.
- Recipient fetch requires a separately signed domain-separated request binding account/device, current fence/binding, group and cursor, with a consumed nonce. It returns only ciphertext bytes and routing metadata belonging to the fixture recipient.
- A deterministic lock order for sender and recipient device rows (`FOR UPDATE`) plus locked fixture membership rows (`FOR SHARE`) prevents ordinary membership revocation or device revocation from slipping between server validation and message acceptance.
- `openmls-poc/checkpoint/pg-envelope-ds.test.mjs` covers exactly-once grants, idempotent delivery, full/partial rollback, tampering, wrong sender/recipient, replayed sync nonce, revocation, two competing writers, queued envelopes after later revisions, independent pool recovery, group removal and concurrent revocation.
- `.github/workflows/gwap-messenger-envelope-postgres.yml` runs all tests against an ephemeral PostgreSQL 16 GitHub Actions container. No Neon, user database, keys, or production service was connected.

## Precise evidence

| Gate | Result |
|---|---|
| Existing signed PostgreSQL durable checkpoint | **14/14 pass** |
| Existing signed localhost HTTP contract | **6/6 pass** |
| New envelope grant + recipient sync including concurrency | **16/16 pass** |
| PostgreSQL transactional commit of checkpoint + grant | **PASS** |
| Distinct sender and recipient authenticated fixture signatures | **PASS** |
| Older still-authorized queued envelope after later revision | **PASS** |
| Conflicting idempotency, bad ciphertext, unauthorized membership | **Rejected** |
| Concurrent membership removal or recipient device revocation | **Rejected** |
| Actual OpenMLS bytes in *this* PostgreSQL test | **NOT tested** |
| Live `.gwap` wallet/domain ownership and transfer | **NOT tested** |
| Real iPhone Safari | **NOT tested** |

Previous isolated Chromium/SQLite experiments did accept **real OpenMLS-generated PrivateMessages**, but this PostgreSQL suite uses **random opaque ciphertext fixtures**. Do not equate those earlier results with a fully integrated Postgres/MLS browser application.

## Critical security limitations — release blockers

1. **No GNS-backed device identity**: test fixture enrollment bypasses the canonical account/wallet `.gwap` ownership proof. The local PostgreSQL group membership table is not an MLS-authenticated group roster. Full current-name ownership, wallet/device signature verification, transfers, revocations and group rekey remain separate.
2. **Outbox membership proof**: the signed ciphertext hash is a claim from the authorized device. The server cannot independently prove the envelope is included in the opaque encrypted MLS-state snapshot. Before production, define an authenticated per-envelope commitment / manifest linked to durable client state that reveals no MLS secrets.
3. **Transport and delivery**: no complete Delivery Service with canonical Commit/Welcome sequencing, recipient consent, authenticated persistent sync/acks, server TLS, throttles, expiry/retention rules, group invitation policy or monitoring. The test-only recipient nonce table needs retention and cleanup, otherwise unbounded growth is possible.
4. **Credential lifecycle**: no persistent server signing-key rotation, key transparency, loss/recovery, multi-device state or real GNS account takeover/transfer handling. Tests sign with ephemeral generated keys.
5. **OpenMLS state custody**: earlier browser proof serializes `MemoryStorage` secrets into transient JS/WASM memory and seals the snapshot in IndexedDB. That is **not** a reviewed production storage adapter. Design a vetted, schema-versioned OpenMLS StorageProvider or transactionally integrated async adapter with verified deletion of expired secret material, crash consistency, XSS boundary, local backup/eviction behavior, and no key/nonce reuse.
6. **End-device compatibility**: iPhone Safari and full mobile lifecycle still require separate explicit test authorization; desktop/headless Chrome is not a substitute.
7. **Postgres availability/security**: CI uses an ephemeral single-node PostgreSQL 16. No failover, network split, loss of DB volume, RLS/least-privilege roles, production connection pooling, deployment architecture or independent audit was tested.

## Next smallest engineering step

Combine the already-verified Chromium OpenMLS WASM outbox fixture with this PostgreSQL envelope gate and **actual recipient device authentication**, then test the real encrypted bytes, grant/revision linkage, out-of-order messages, group-epoch changes, and transfer/revocation. In parallel, make an explicit **storage-adapter ADR** with required raw-secret deletion and failure/eviction tests. Do not merge/deploy until approved.

**Repository release boundary:** this is a GitHub test-only branch. No merge, Vercel Preview, GNS mainnet activation, production deployment or public E2EE claim.