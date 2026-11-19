# ADR-0003 · GWAP Messenger Browser MLS Storage: Production Acceptance Gate

**Status:** Proposed, NOT selected for production. **Date:** 2026-11-17.
**Tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341

## Context

Existing disposable OpenMLS 0.9.2/WASM tests have used `OpenMlsRustCrypto` `MemoryStorage` snapshots copied into JS/WASM memory, encrypted with a non-extractable WebCrypto AES-GCM key, and written to IndexedDB. Browser reload/process restart, tamper rejection and several atomic outbox failure injections passed. This is a useful proof of concept, **not a production StorageProvider**: OpenMLS writes and deletes individual secrets during protocol operations, and the raw snapshot path can retain old secret copies.

Official guidance:
- OpenMLS StorageProvider trait and persistence requirements: https://book.openmls.tech/traits/traits.html
- Forward secrecy, irrevocable deletion and trusted stored-state semantics: https://book.openmls.tech/user_manual/persistence.html
- OpenMLS WebAssembly: https://book.openmls.tech/user_manual/wasm.html
- OpenMLS 0.9 storage migration/import: https://book.openmls.tech/user_manual/migration.html

## Candidate design direction (subject to prototype and independent review)

1. **Do not ship raw `MemoryStorage` JSON snapshotting.** Evaluate a versioned OpenMLS `StorageProvider` bridge (including the 0.9 async storage feature) backed by browser IndexedDB and reviewed WebCrypto sealing. Determine whether OpenMLS writes can be safely committed with a single recipient/sender state transaction and coordinated with an encrypted outbox; never assume an async adapter is a simple drop-in.
2. **Single active device/account for Phase 1.** Use a server-issued per-device fenced lease plus browser Web Locks for same-origin tab admission; explicitly revoke on binding transfer. Fail closed if revision/commitment and device binding cannot be independently verified.
3. **Seal at rest, with precise guarantees.** Use non-extractable origin-scoped WebCrypto keys for envelope encryption and authenticated metadata; keys remain usable by same-origin scripts, so protect CSP/Trusted Types/supply-chain paths. AES-GCM nonce uniqueness and schema/identity/revision AAD must be tested.
4. **Protect send-before-persist invariant.** A sender must not emit a new MLS ciphertext until the updated sender ratchet and exact pending envelope/idempotency token are durable. Replay the same queued bytes on retry, never generate a replacement from stale state.
5. **Preserve OpenMLS secret-deletion lifecycle.** OpenMLS uses `delete_*` methods as part of forward secrecy. Test deletion, migration, IndexedDB transactional behavior, browser backups/profile rollback, and storage eviction. IndexedDB cannot guarantee physical secure erase across browser backups or SSD wear leveling; document this limitation instead of overstating forward secrecy.
6. **External monotonic authority.** Advance a durable authenticated high-watermark/commitment and independently fenced sender device ID. Do not accept local revision checks alone; an attacker may restore an older encrypted snapshot. Define offline policy and reset path for rolled-back/missing state.
7. **No automatic historical recovery.** A lost device, evicted browser profile or transfer may require resetting identity/group. Never promise old history restoration or retroactive erasure.

## Required verification tests before acceptance

- Real wasm OpenMLS `StorageProvider` API, not raw map serialization: create, Add, Welcome, send, Commit, receive, rekey, reload; include migration from one provider schema to another.
- Test exact deletion invocations; ensure stale MLS key material is not accidentally copied into backup snapshots. Address limits of physical erasure explicitly.
- Atomic versioned writes under quota exhaustion, transaction abort and forced tab/process termination at every boundary (before transaction, after transaction, before/after checkpoint, before/after send).
- Adversarial multi-tab locks, lease expiration and server-fence rotation, with no duplicate sender generation or unauthorized ciphertext release.
- Full profile rollback: old but authentic AES-GCM state blocked by independent checkpoint, including offline/outage behavior.
- Chrome + **real iPhone Safari**: page reload, PWA installation, app suspension, private mode, storage eviction and device loss.
- Independent security review: XSS, CSP, dependency pinning, provenance, browser key usability, rollback/nonce risks, privacy exposure, group roster/device credential binding.

## Current decision

**Do not select a production StorageProvider yet.** Keep browser state proof-of-concept strictly isolated. The current sprint validates real browser MLS ciphertext traveling through an ephemeral PostgreSQL message-grant/recipient-fetch fixture; it does not upgrade client storage assurance.

## Release boundary

No merge to `main`, production migration, Vercel preview/production deployment, mainnet GNS connection or public E2EE claim without explicit owner approval and passing security evidence.