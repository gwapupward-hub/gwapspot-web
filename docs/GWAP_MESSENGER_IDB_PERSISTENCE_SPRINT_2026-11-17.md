# GWAP Messenger — Encrypted IndexedDB Persistence Spike

**Date:** November 17, 2026  
**Branch:** `test/gwap-messenger-idb-persistence-20261117`  
**Scope:** isolated, disposable browser cryptography/storage test; no production changes, GNS calls, merge, deployment, or customer data  
**Canonical tracker:** [Issue #341](https://github.com/gwapupward-hub/gwapspot-web/issues/341)

## Executive result

**PASS for a narrow Chromium browser persistence integration test, NOT production-secure persistence.**

- Corrected successful run: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44157905052
- Native Rust 1/1 tests passed.
- Node WASM 3/3 test functions reported successful. **The IndexedDB integration test early-returns in Node** because no browser `window` is present; this is NOT Node IndexedDB coverage.
- Real headless Chromium WASM 3/3 tests passed, including `browser_persistence::indexeddb_encrypted_snapshot_resumes_real_openmls_group`.
- Initial failing run: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44157722836 — introduced Rust inner-doc-comment placement error, corrected without crypto changes.

## What the genuine Chromium test does

1. Generate distinct OpenMLS provider instances and **fixture-only** BasicCredentials (not verified `.gwap` ownership).
2. Use OpenMLS 0.9.2 to generate a signed KeyPackage, create an MLS group, Add/Commit, Welcome and process the join.
3. Capture **all current raw key/value items** from Bob's OpenMLS `MemoryStorage` and serialize as an experimental JSON snapshot.
4. Invoke browser WebCrypto to generate a **non-extractable AES-256-GCM CryptoKey**, store it via structured clone in IndexedDB, then encrypt the snapshot with a fresh 96-bit nonce and associated data binding the snapshot revision.
5. Store **only the encrypted snapshot bytes** and metadata in IndexedDB. Close and reopen the DB connection; reconstruct Bob's group in a fresh Rust OpenMLS provider. Verify epoch authenticator equality and decrypt Alice's next valid MLS `PrivateMessage`.
6. Flip a bit in persisted AES-GCM ciphertext and assert snapshot decryption fails. Replace it with a fresh encrypted snapshot and verify restored state again.
7. Delete the test database.

No cryptographic algorithms were implemented manually: encryption of MLS messages comes from OpenMLS, storage encryption from WebCrypto AES-GCM. The `MemoryStorage` map snapshot code is a **non-production, internal compatibility test** and should NOT be used as the final storage adapter.

## Security-critical gaps before release

- [ ] Actual browser reload, tab/process restart, iOS Safari/iPhone, private-browsing/eviction, power loss and crash recovery NOT tested. Browser-mode test remains a **single-page** WebAssembly run.
- [ ] **No multi-tab or cross-process transactional lock**. Two tabs might snapshot same generation or overwrite a newer ratchet state: **never ship as-is**.
- [ ] **No durable monotonic rollback/anti-replay anchor**. Old encrypted snapshots can be restored if an attacker can roll back IndexedDB state, despite AEAD authentication and revision AAD. This could permit message-key reuse.
- [ ] **No crash-atomic API boundary** connecting MLS state mutation, persisted durable state and outbound network send. Production must not release encrypted messages until sender-ratchet state has been durably and atomically recorded.
- [ ] WebCrypto CryptoKey is stored in same-origin IndexedDB and is **not extractable**, but a same-origin script/XSS can still instruct WebCrypto to decrypt local snapshots and observe key material during serialization. Does NOT provide protection against malicious JavaScript or device compromise.
- [ ] The raw snapshot transiently copies sensitive MLS keys into JavaScript/WASM memory; no zeroization, bounded snapshots, protected secret export, or signed migration policy. Browser/OS backups and IndexedDB copies can retain old secrets, which may undermine forward secrecy guarantees.
- [ ] **One-shot snapshotting** is inefficient for production and should be replaced with an audited transactional `StorageProvider` bridge or async storage design. OpenMLS `StorageProvider` deletion semantics and secure secret retirement must be honored.
- [ ] No live GNS wallet/domain/device credential verification, KeyPackage directory, domain transfer handling or persisted delivery-service contract integration.
- [ ] No independent crypto/storage security review, threat-model signoff, key recovery/rotation or customer-grade UX.

## iPhone Safari acceptance gate

A real iPhone Safari run requires either an explicitly authorized **temporary HTTPS test deployment** (not production) and manual device verification, or an authorized real-device cloud testing service. Headless Chromium on a Linux runner is **not equivalent to Apple mobile Safari**.

Required real-device tests: initial key generation, IndexedDB CryptoKey structured clone, encrypted snapshot write + read, full reload, browser kill/restart, foreground/background, PWA install/uninstall, storage pressure/eviction and private browsing. Verify no plaintext/state leaks to telemetry and that missing/reverted key material fails closed with accurate user messaging.

## Next smallest authorized engineering work

Build an adapter with transactionally durable state before network send, a version/anti-rollback strategy, and exclusive per-account active-device lock, then rerun full Chromium reload tests. Stage a **separate explicitly approved temporary HTTPS test page** for iPhone Safari only after security review of its isolation; no main-branch merge or production deployment is authorized.
