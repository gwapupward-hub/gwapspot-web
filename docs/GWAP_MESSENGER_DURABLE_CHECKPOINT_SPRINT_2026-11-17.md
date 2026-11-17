# GWAP Messenger — Durable Authenticated Checkpoint Sprint

**Date:** November 17, 2026  
**Branch:** `test/gwap-messenger-checkpoint-postgres-20261117`  
**Outcome:** Isolated PostgreSQL-backed checkpoint service test **PASS**, not production-ready.  
**Canonical tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341

## GitHub Actions evidence

**Final successful run:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44191542538

| Executed gate | Result | Evidence |
| --- | --- | --- |
| Pre-existing in-memory checkpoint contract | **10 passed, 0 failed** | Node `node:test`; mock Ed25519/CAS/fence semantics |
| NEW PostgreSQL 16 durable checkpoint integration | **14 passed, 0 failed** | Disposable GitHub Actions PostgreSQL service |
| NEW localhost HTTP request integration | **6 passed, 0 failed** | HTTP over `127.0.0.1`; real PostgreSQL and signed responses |
| **Total checks in latest run** | **30 passed, 0 failed** | GitHub Actions completed successfully |

These 30 tests are checkpoint/transport-control tests, **not 30 OpenMLS cryptographic tests**. Previous native OpenMLS/WebAssembly tests remain separately documented.

## Implemented isolated test files

- `openmls-poc/checkpoint/pg-schema.sql`: PostgreSQL tables for per-device checkpoint revision, sealed-state hash, binding version, public device signature key, fence, revocation, and durable idempotency receipts; no message plaintext, MLS private keys or ciphertext envelopes.
- `openmls-poc/checkpoint/durable-checkpoint.mjs`: Ed25519 device signature validation; domain-separated canonical checkpoint/resume messages; `SELECT ... FOR UPDATE` serializes concurrent writers; transactionally updates revision and inserts persisted idempotency receipt; enforces `synchronous_commit=on` for checkpoint updates; signs receipts with an injected server Ed25519 key; detects local revisions behind/ahead of DB and different encrypted-state commitments.
- `openmls-poc/checkpoint/durable-checkpoint.test.mjs`: 14 integration tests for durable idempotency across a new DB pool, concurrent writes (exactly one accepts), collision/replay, transaction rollback after UPDATE, stale fence, revocation, fake signature, wrong account, old binding, separate signature domains, disabled fixture admin, absent plaintext DB columns and database outage.
- `openmls-poc/checkpoint/local-http-test-server.mjs`: **localhost-only**, test-only `POST /v0/checkpoint/advance` and `POST /v0/checkpoint/resume`; fixed 8 KiB JSON limit, no-store cache control and status on malformed or unauthorized requests. **No public enrollment API**.
- `openmls-poc/checkpoint/local-http-test-server.test.mjs`: 6 HTTP integration tests including signed receipt verification, idempotent replay, forged requests, stale/revoked identity failure, malformed/body limits and DB outage.
- `.github/workflows/gwap-messenger-checkpoint-postgres.yml`: disposable `postgres:16` service, no user Neon database, no secrets or deployments.

## Security boundaries and important nonclaims

1. **Not live GNS authentication.** Database enrollment is restricted to an explicitly flagged test fixture. A production enrollment route cannot be implemented before verified GNS/.gwap domain control, Solana wallet signature, current account-device credential authorization and transfer/revocation semantics.
2. **Not a production high-availability checkpoint.** PostgreSQL persists transactions across application connection-pool replacement in tests; a real PostgreSQL server power-loss, failover, backup restore or multi-region consistency incident was **not** tested. Retention and WAL durability policy require operational review.
3. **Not complete protection from a malicious delivery service.** These endpoints supply signed state/receipt assertions, not actual DS-side one-time release authorization. The DS must check account/device/binding and current fencing/lease under a server-side transactional protocol; a previously issued resume receipt must not be treated as an indefinitely reusable send token.
4. **No secret key material in database.** Schema stores public credential keys, 64-character hash commitments, revisions, and metadata. Still consider privacy: a per-device hash/revision trail may reveal activity volume or correlation if exposed. Apply access control, per-tenant isolation, retention, monitoring and rate limits before deployment.
5. **Server signing key is ephemeral for the tests.** It is generated in the CI runner, not saved to GitHub. Production requires protected persistent server signing keys, rotation, trusted public-key distribution, disaster recovery and audit.
6. **HTTP is loopback only, no TLS.** This is a local test adapter; not appropriate for production or mobile browser communication as written. Request origin/authentication, CSRF, rate-limit and denial-of-service defenses are not complete.
7. **No browser-state integration with this endpoint yet.** The separate OpenMLS browser outbox fixture still uses its own local expected revision; checkpoint logic is an independent durable reference, not end-to-end integration. A real atomically gated send requires the local outbox, authenticated remote checkpoint and delivery service to coordinate safe retries.
8. **No production-approved StorageProvider.** The earlier OpenMLS memory-map snapshot is an experimental bridge; MLS secret material temporarily enters WASM/JS memory. Secure serialization, secret erasure, rollback/crash recovery, Safari and XSS risk remain release blockers.
9. **No live Solana, Neon, Vercel, GwapOS app, or mainnet integration** occurred.

## Release gates and next engineering sprint

1. Couple the independently authenticated Postgres checkpoint with the browser outbox under a DS-authoritative, idempotent send protocol. Demonstrate process crash between DB and network delivery without double emission or sender-generation reuse.
2. Replace the raw OpenMLS `MemoryStorage` snapshot export with a reviewed storage adapter; validate security of group-state deletion, pending Commit snapshots, multi-tab/different-device fences, quota evictions and schema migrations.
3. Add real GNS ownership/account/device enrollment proofs, authoritative transfer checks and event reconciliation on the intended network. Fail closed on resolver outage.
4. Test actual iPhone Safari with a separately approved, access-controlled HTTPS test surface and documented key-storage restrictions.
5. Owner security review and explicit separate approval before any merge, preview deployment or production release.

**Release status:** Test-only branch and disposable GitHub Actions. No merge or deployment authorized or performed.