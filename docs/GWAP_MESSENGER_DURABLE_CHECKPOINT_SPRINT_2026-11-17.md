# GWAP Messenger — Durable Checkpoint and Browser Integration Sprint

**Date:** 2026-11-17
**Branch:** `test/gwap-messenger-durable-checkpoint-20261117`
**Status:** Isolated test-only spike **passed**. Production authority and production messenger **not shipped**.
**Canonical issue:** https://github.com/gwapupward-hub/gwapspot-web/issues/341

## CI evidence

- [Durable SQLite checkpoint SIGKILL test](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44189734926) — **success**.
- [Chromium OpenMLS WebAssembly + checkpoint integration](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44190106769) — **success**.
- Native OpenMLS crypto regression remains **1/1 passing**.
- Previously established Chromium reload, two-tab contention, encrypted outbox and synthetic transaction failure tests remain on isolated preceding branches; this sprint builds upon them.

## Exactly what ran

**Checkpoint service:** disposable local Node.js 24 process bound only to `127.0.0.1`, using temporary SQLite DB with `PRAGMA journal_mode=WAL` and `PRAGMA synchronous=FULL`. Each advancement runs in `BEGIN IMMEDIATE` / `COMMIT`, validating a device **Ed25519 signature**, canonical account/device/binding context, writer fence, expected revision and SHA-256 ciphertext-snapshot commitment. The idempotency token and its receipt are committed atomically with the revision.

**Durable authority tests:** 10/10 existing signed in-memory reference tests plus 1 new process-lifecycle integration test passed. The latter exercised unauthorized fixture enrollment, valid signature, forced **SIGKILL after transaction COMMIT but before HTTP reply**, fresh server process with the *same SQLite file*, rollback rejection of an old but previously valid checkpoint, exact signed retry idempotency, competing CAS requests (exactly one accepted), bad signature, binding/fence rotation, revocation and denial when authority is offline.

**Browser integration:** real OpenMLS 0.9.2 WebAssembly in headless Chromium, with a browser-owned WebCrypto AES-256-GCM nonextractable CryptoKey and IndexedDB-encrypted MLS sender/receiver fixture. The test controller registered a generated Ed25519 device key in the separate loopback checkpoint service and anchored revision 1. After generating a real encrypted MLS outbox envelope, it anchored revision 2, then deliberately **replaced the IndexedDB snapshot with an older authentic revision-1 ciphertext**. The external checkpoint rejected this local rollback. Restoring the later snapshot permitted resumption.

The test then generated another encrypted MLS envelope, crashed the checkpoint server with SIGKILL **after the revision-3 SQLite commit**, denied test-controller delivery during the outage, restarted both the server process and Chromium against their prior persistent storage, recovered the signed idempotent receipt, and successfully decrypted the two queued MLS messages. Receiver state checkpoint revisions were advanced again after decryption. GitHub Actions logged `result: PASS` with six grounded checkpoints.

## Files added

- `openmls-poc/checkpoint/sqlite-checkpoint.mjs` — local persistent signed CAS, fencing and idempotency reference
- `openmls-poc/checkpoint/sqlite-server.mjs` — loopback-only ephemeral fixture HTTP process with admin-token-gated bootstrap and deterministic post-commit SIGKILL
- `openmls-poc/checkpoint/sqlite-checkpoint.test.mjs` — process kill/restart and monotonic durable tests
- `openmls-poc/browser-test/checkpoint-integration-runner.mjs` — real Chromium OpenMLS outbox + external checkpoint controller test
- `.github/workflows/gwap-messenger-durable-checkpoint.yml` and `.github/workflows/gwap-messenger-durable-browser.yml` — read-only, branch-scoped CI workflows

## Threat model limitations and release blockers

1. **Not a production checkpoint API.** Fixture bootstrap is admin-test-token gated, not bound to authoritative live GNS ownership or a GwapOS authentication session. No production authorization, routing, rate limits, audited TLS infrastructure, key rotation protocol, or operational monitoring has been built.
2. **The browser enforcement is currently in a Playwright/Node test controller.** The OpenMLS client module and the actual delivery service do *not* enforce remote checkpoint authorization before transport. Client-side checks can be bypassed by compromised origin code. A real DS must validate authenticated fencing, device binding and permitted envelopes; avoid overstating the browser test as full anti-rollback enforcement.
3. **SQLite durability is demonstrated for a service process SIGKILL, not power outage or corrupted disk.** Test database is ephemeral, and no backup, failover, HA, key transparency, transaction replication or multi-process distributed deployment design has been validated. Permanent infrastructure should use an isolated, permissioned durable DB with transactional CAS and a migration/recovery plan.
4. **The browser test uses raw OpenMLS `MemoryStorage` snapshot serialization containing secret material.** A reviewed OpenMLS storage adapter with secure secret retirement/zeroization and tested migration is still missing. AES-GCM nonextractable WebCrypto keys do not defeat same-origin XSS.
5. **Idempotent checkpoint receipts are not DS acknowledgments.** No authenticated network delivery queue, duplicate-delivery tests against a real DS, per-conversation ordering service, or remote receipt binding has been implemented.
6. **No real iPhone Safari testing** or long-term browser eviction, low-storage, power loss, OS suspend, privacy/private-browsing, multi-device sync, or lost-device recovery. The previous macOS Safari attempt was canceled; it did not pass.
7. **No live GNS/Solana checks**, domain transfer, GwapOS account/device enrollment, user consent/abuse policy integration, cryptographic audit or security incident response.

## Next gated milestones

1. **Server-enforced checkpoint + delivery contract** with authenticated GwapOS device credentials, persistent per-device fencing, DS idempotency and signed commit authorization. Select an isolated Postgres development schema (or equivalent), with no writes to existing production databases without separate approval.
2. **Production-grade MLS storage provider** supporting atomic ratchet/outbox transition, failure injection under browser quota/abrupt crash, safe key lifecycle, and independently verified durable checkpoints.
3. **Real device validation:** access-controlled nonproduction HTTPS test page for iPhone Safari, requiring separately approved test deployment and explicit owner-controlled QA.
4. **GNS:** authoritative devnet `.gwap` ownership and domain transfer/revocation integration after storage/authorization gates.

**Release boundary:** No merge to main, no PR merge, no Vercel Preview, no production deployment, no changes to customer data, and no public end-user E2EE assurance are authorized by this checkpoint.