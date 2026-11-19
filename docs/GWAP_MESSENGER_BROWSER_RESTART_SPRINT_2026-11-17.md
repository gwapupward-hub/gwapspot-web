# GWAP Messenger — Full Chromium Process Restart Spike

**Date:** November 17, 2026  
**Status:** Clean browser process restart test PASSED; production storage safety NOT established.  
**Branch:** `test/gwap-messenger-restart-20261117`

**Verified CI run:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44168853156

## Verified test evidence

- Native OpenMLS 0.9.2 regression: **1/1 pass**, zero failures.
- WebAssembly build: **PASS** for browser-loadable OpenMLS.
- Playwright launched Chromium with a persistent local profile, created a real two-member OpenMLS group, and encrypted the fixture Bob group state using browser WebCrypto AES-256-GCM; both the non-extractable CryptoKey and encrypted snapshot were stored in IndexedDB.
- Full page reload: fresh WASM provider restored state and decrypted the next MLS application message; checkpoint advanced from revision 1 to 2.
- **Entire Chromium process closed and relaunched with the same on-disk profile**: state restored and second MLS message decrypted; revision advanced from 2 to 3.
- Second page reload: third MLS message decrypted and revision advanced from 3 to 4.
- Stale expected-revision write rejected; modified persisted AES-GCM ciphertext rejected.
- Test runner emitted structured **`result: PASS`** with all six operations confirmed in GitHub job logs.

**Fixture paths:** `openmls-poc/src/browser_restart.rs`, `openmls-poc/browser-test/index.html`, `openmls-poc/browser-test/restart-runner.mjs`, `.github/workflows/gwap-messenger-browser-restart.yml`.

## Precisely scoped caveats

- Clean browser shutdown/relaunch is **not** crash/power-loss injection. The test does not establish crash-atomic outbound delivery or guaranteed disk persistence under browser/OS failure.
- The fixture serializes the **entire OpenMLS MemoryStorage map**, including secrets, in transient Rust/JS memory before WebCrypto encryption. It is not a reviewed production StorageProvider and does not guarantee key zeroization.
- A non-extractable AES-GCM CryptoKey in IndexedDB does not protect against same-origin XSS/malicious JavaScript, which can invoke `crypto.subtle.decrypt`.
- Write serialization uses `navigator.locks` with an exclusive, nonwaiting lock; the stale-revision CAS was tested, but a hostile multi-tab race is not yet tested.
- Caller-provided minimum revision is a **test-only simulated checkpoint**. Full rollback of an IndexedDB database may restore a previous valid sealed snapshot unless a **separate authenticated external monotonic checkpoint** is consulted. Do not advertise rollback resistance.
- No real iPhone Safari or macOS Safari result. macOS Safari workflow https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44158634173 was canceled after entering interactive mode.
- No live GNS name, wallet/device signing credential, KeyPackage directory, server-controlled delivery, or domain-transfer integration has been exercised.

## Next release-blocking engineering milestones

1. Concurrent-tab adversarial lock and fenced-writer tests: concurrent sends must not advance the same MLS ratchet or emit duplicate ciphertext.
2. Atomic sender state + encrypted outbox + idempotency journal that commits before any transport emission, including quota failure and abrupt crash injection.
3. Independently trusted monotonic revision checkpoint and safe offline/recovery policy that detects complete-state rollback.
4. Reviewed OpenMLS storage adapter; remove transient raw MemoryStorage snapshot export, address key migration/deletion/backup and XSS threat model.
5. Actual iPhone Safari testing on a separately approved, access-controlled HTTPS test page; no production deployment or main branch merge.
6. Live devnet GNS verification, device credential issuance, and transfer isolation only after local crypto/state safety gates.

**Approval boundary:** test-only branch and CI authorized; no merge, production deploy or public E2EE claim.