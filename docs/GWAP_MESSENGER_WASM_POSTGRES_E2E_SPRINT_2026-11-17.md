# GWAP Messenger · Real Chromium OpenMLS → PostgreSQL Envelope/Recipient Integration

**Date:** November 17, 2026 (CI completed early November 18 UTC)  
**Status:** **PASS — disposable cross-component cryptographic test**, NOT production E2EE release  
**Branch:** `test/gwap-messenger-wasm-postgres-e2e-20261117`  
**Verified CI run:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44204097700  
**Tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341

## What the actual CI runner proved

- Native OpenMLS 0.9.2 regression `cargo test`: **1 passed; 0 failed**.
- OpenMLS browser WebAssembly build `wasm-pack build --release --target web`: **PASS**.
- Actual headless Chromium/OpenMLS WASM + disposable PostgreSQL 16 test runner: structured `result: PASS` with six explicitly logged verification stages.
- **Create** a real two-member OpenMLS group and encrypt a first `PrivateMessage` in Chromium; serialize only ciphertext for the server handoff.
- **Checkpoint + authorization**: server refuses ciphertext before a device-signed per-envelope grant. A signed grant advances a durable PostgreSQL device-state revision and stores the exact envelope hash, group/recipient, epoch label and message ID in one transaction. A second signed request stores the opaque ciphertext; byte-identical retry is idempotent.
- **Recipient access**: fixture Bob device signs a group/cursor/nonce request; forged signer or fixture Eve (not in authorized group) cannot fetch. Bob fetches exactly the first PostgreSQL-stored ciphertext.
- **Actual decrypt**: the browser passes the *retrieved* ciphertext bytes to the OpenMLS Bob group, checks equality to the queued sender envelope, authenticates/decrypts it locally, persists advanced state and rejects a repeat invocation from the stale revision.
- **Restart**: close/relaunch the Chromium browser process with its existing IndexedDB profile; rehydrate OpenMLS state and encrypt a second actual MLS PrivateMessage. PostgreSQL grant/submit and signed recipient cursor fetch return only the new envelope; OpenMLS decrypts it successfully.
- **Fail closed**: fixture recipient group removal refuses sync; fixture sender device revocation refuses the repeated DS submit.
- PostgreSQL's `messenger_opaque_deliveries` schema stores opaque ciphertext/routing metadata and no plaintext, MLS group secrets, sender ratchet or client private keys.

CI development history:
- First attempt [#44203645845](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44203645845) failed due to an isolated static HTTP test server attempting to send an error response after headers were already sent (not an MLS/PG test failure).
- Corrected test-only HTTP fixture and reran [#44204097700](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44204097700): **SUCCESS**. Rust/native, wasm build and actual Chromium/Postgres integration all green.

## Scope and security limitations that MUST remain visible

1. **Not two independent deployed clients.** Alice's and Bob's OpenMLS groups (including both key stores) live in the same *test-only* browser snapshot. The test proves correct MLS cryptographic bytes through PG and Bob decryption, not independent users/devices, origin separation or network E2EE confidentiality under compromise.
2. **Fixture identity only.** The PostgreSQL signer keys, account labels and group membership roster are generated within the test runner. They are **not** cryptographically linked to the real OpenMLS BasicCredential identities or authoritative current `.gwap` owner on Solana. No actual wallet-signature/GNS transfer/revocation proof.
3. **No production Delivery Service.** The PG access is invoked directly by the Node test runner, not from a deployed authenticated HTTP/TLS API. The `epoch: 1` in the grant is a test label, not separately proven current by the DS. Canonical MLS Proposal/Commit/Welcome sequencing, membership authorization, request consent/block, rate limits, retention, durable cursor/acknowledgement and network retries are missing.
4. **Client-state custody not ready.** The browser fixture snapshots entire OpenMLS MemoryStorage key/value state into WASM/JS transient memory before WebCrypto AES-GCM encryption in IndexedDB. OpenMLS expects secure deletion of superseded key material; this POC does not guarantee it. A new audited StorageProvider/migration plan and XSS/key lifecycle review are required.
5. **Envelope proof gap.** Device signature + ciphertext hash/grant constrain submitted bytes, but the PG DS cannot cryptographically prove the submitted envelope actually appears in the encrypted client outbox snapshot. This binding must be designed before accepting malicious-client threat model claims.
6. **Failure model.** Clean Chromium restart and SQLite/PG test failure injection are not power loss, storage eviction or PostgreSQL failover tests. Server-side signer/fence policy is generated fixture data; no production key lifecycle, RLS or administrative protection tested.
7. **No mobile Safari.** Headless Chromium on GitHub Linux is not a real iPhone Safari/PWA acceptance run.

## Next engineering gates

- Independent Alice/Bob device/credential sessions and authenticated first contact, with *actual* Welcome/Commit transmitted via a properly ordered DS; GNS wallet/device proof and domain transfer should fail closed.
- Replace raw MemoryStorage snapshots with a vetted OpenMLS StorageProvider or async storage bridge; validate deletion, crash-atomic outbox, rollback checkpoint, secret migration and key-protection limitations documented in [ADR-0003](GWAP_MESSENGER_ADR_0003_MLS_BROWSER_STORAGE_GATE.md).
- Implement a test-only authenticated HTTP interface and separate recipient device, then real iPhone Safari testing on an explicitly authorized **isolated** HTTPS test surface.
- Independent security review and owner-approved release gates before any merge or production exposure.

**No source merge, preview deploy, production deploy, mainnet GNS action or public E2EE claim occurred.**