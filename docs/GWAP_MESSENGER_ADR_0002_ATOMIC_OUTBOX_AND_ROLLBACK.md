# ADR-0002 · MLS sender state, encrypted outbox and trusted rollback checkpoint

**Status:** PROPOSED SECURITY DESIGN — not approved for production. **Date:** 2026-11-17.
**Repo context:** GWAP Messenger issue #341; isolated OpenMLS test-only branch.

## Safety invariant

Never release an MLS encrypted application envelope to network delivery unless a transactionally durable **sender-state advancement plus that exact envelope and idempotency key** exists, and an independently trusted high-water-mark check permits release.

An IndexedDB CryptoKey with extractable=false protects against direct key export only. It does not stop same-origin JavaScript from invoking decrypt or copying secrets in WASM/JS memory. Native client/OS key management is a separate question.

## Proposed minimum data and ordering (not yet implemented)

1. Each active cryptographic device has an enrolled, revoked/rotatable signed public credential bound to a stable GWAP account and current `.gwap` owner snapshot. The server acts as an authenticated anti-rollback authority for that **device state version**, not as a decryption key holder.
2. Server checkpoint fields: account ID, device ID, identity binding version, minimum accepted monotonic sequence, hash commitment to the sealed local ratchet+outbox snapshot, current fencing/lease generation, signature/authorization context and update timestamp. Do not include plaintext or group secrets. Resolve whether the commitment can reveal message-activity metadata.
3. After current ownership/credential check, acquire a single active writer fence for the device, using server-issued monotonic lease generation plus browser Web Locks for same-origin tab coordination. Web Locks alone cannot prevent another device or rolled-back browser profile from sending.
4. Generate exactly one OpenMLS ciphertext inside a locked local state transaction. Atomically commit encrypted post-send OpenMLS state **and** a durable encrypted outbox journal entry (ciphertext, idempotency key, group/epoch, state revision, delivery status). If quota, encryption, DB transaction, or browser storage fails, release no message. A commit with lost response is recovered from the journal, never regenerated with a stale sender generation.
5. Obtain a durable authenticated server checkpoint advancing high-water mark using expected sequence + fencing token + opaque commitment. If the checkpoint is behind local state after an interrupted operation, safely reconcile it without retransmitting a newly encrypted message. If server is ahead of local state, **fail closed** and require an explicit recovery/reset process; do not silently reuse old sender keys.
6. Only then transmit the already persisted envelope to a DS under the same idempotency key. DS must deduplicate, reject stale binding/fence, and provide an authenticated append/delivery receipt. Network retry sends the *same bytes*, not a second encryption of the same logical message.
7. After receipt, atomically mark delivered/acked and persist updated local state. A failed receipt commit leaves outbox pending for idempotent retransmission. Recipient separately verifies MLS replay and epoch ordering.
8. Offline policy: permit local queueing only if the required epoch, key state and local lock are valid. If trusted checkpoint cannot be refreshed, **hold outgoing network delivery**; no unsupported promise of real-time offline sending. Define supported offline duration and recovery UX.

## Threat model and must-fail tests

| Fault/attacker | Required result |
| --- | --- |
| Two same-origin tabs race one group | Only one commits/returns a network-eligible envelope; the loser must reload state |
| Browser closed after encrypt, before IndexedDB commit | No envelope emitted; restart from last committed key state |
| IndexedDB abort/quota failure | No sender-state advancement or outbox entry; no network output |
| DB commit succeeds but caller response lost | State + exact envelope already in journal, recovered after restart; no re-encryption on retry |
| Browser dies after independent checkpoint advances but before DS accepts | Local encrypted journal survives; retry *same envelope* with same idempotency key |
| Entire local DB/key is replaced with an older consistent snapshot | Server high-water mark detects regression (not solvable by local revision AAD alone); fail closed |
| Attacker supplies forged device binding, old lease or wrong group | Reject via authenticated account/device identity, lease fence and membership verification |
| Same-origin XSS or device takeover | WebCrypto nonextractability is insufficient; prevent XSS through CSP/Trusted Types/dependency controls, warn on compromise and rotate |
| DS delivers ciphertext twice | Idempotency and MLS replay protection; no second user-visible accepted message |
| Domain transfer | Old alias binding is revoked; no new sends/KeyPackages authorized; peers rekey/new group; never transfer old inbox history |

## Current test-only implementation boundary

`openmls-poc/src/outbox_spike.rs` combines **real OpenMLS-generated encrypted messages** with a test-only serialized MemoryStorage snapshot and encrypted queued envelopes in a single WebCrypto AES-GCM snapshot, committed with the non-extractable key in one IndexedDB transaction; Web Locks provide same-origin exclusive writer admission. The companion Playwright runner injects transaction abort, response-loss-after-commit, and two-tab contention.

These tests, even when passing, DO NOT establish a production StorageProvider, independent server rollback checkpoint, real network DS, safe browser crash durability, hardware key isolation or live GNS integration. The Rust fixture snapshots raw crypto secrets to JS/WASM memory; do not ship.

## Engineering sequencing

1. Finish & verify two-tab/failure-injection CI suite and document actual logs.
2. Prototype an independently authenticated state-checkpoint endpoint with CAS, fencing, credential checks, idempotency and explicit offline/recovery policy, without plaintext disclosure.
3. Replace MemoryStorage snapshot with reviewed transactional or async storage adapter and test crash/transaction durability across IndexedDB vendor versions.
4. Exercise actual iPhone Safari on separate authorized HTTPS test site, including storage eviction, background suspension, PWA and process kill.
5. Only then integrate live GNS/domain ownership and DS into GwapOS; owner approval for each merge/deployment phase.

**Merge/production:** forbidden until explicit owner approval and security review.