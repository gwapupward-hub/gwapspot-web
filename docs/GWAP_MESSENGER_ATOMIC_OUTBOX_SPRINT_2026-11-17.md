# GWAP Messenger · Atomic Outbox and Trusted-Checkpoint Reference Spike

**Execution date:** November 17, 2026  
**Outcome:** **PASS for isolated test-harness claims**; not production-ready.

**Branch:** `test/gwap-messenger-outbox-locks-20261117`  
**Final green GitHub Actions run:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44186897982  
**Earlier green outbox run:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44186013792  
**Earlier failing outbox run (assertion wording mismatch):** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44185495720  
**Tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341

## Verified GitHub Actions evidence

| Gate | Actual result | Scope |
| --- | --- | --- |
| Monotonic signed checkpoint reference | **10 passed, 0 failed** | Node `node:test`, in-memory mock authority with Ed25519 verifier and per-device state |
| Native OpenMLS 0.9.2 regression | **1 passed, 0 failed** | Real 2-member KeyPackage/Welcome, encrypted messages, epoch changes, replay/tamper protections |
| Browser WebAssembly build | **PASS** | `wasm-pack build --release --target web`, OpenMLS 0.9.2 |
| Browser-restart regression | **PASS** | Actual Chromium close/relaunch with same IndexedDB profile, 3 decrypted messages, revision/ciphertext tamper checks |
| New atomic outbox / two-tab suite | **PASS** | Headless Chromium with 2 same-origin tabs and real OpenMLS sender/receiver fixtures |

### Exact outbox assertions from the final Actions log

1. Created real two-member OpenMLS group, committed fixture sender/receiver ratchet state at revision 1.
2. Tab A held an exclusive Web Lock: tab B's send failed; **no outbox message was released**.
3. Injected a true IndexedDB transaction abort after encrypting the staged state+envelope. Subsequent load showed revision 1 and **zero pending envelopes**.
4. Injected a lost response immediately after a successful IndexedDB transaction. Revision 2 and **one pending MLS ciphertext** were recovered; retry with old revision failed.
5. Closed Chromium process, relaunched same persistent profile, delivered the existing MLS ciphertext to Bob's group, decrypted and acknowledged it exactly once.
6. Two tabs raced a different send at one expected revision; **exactly one** advanced the sender revision and committed an envelope; the other was rejected. Recipient decrypted only the accepted message.
7. Injected transaction abort while processing a queued receiver message. The state and ciphertext remained pending; successful retry decrypted it and updated delivered count.

### Checkpoint reference assertions

The in-memory `InMemoryCheckpointAuthority` verifies domain-separated Ed25519 signatures on typed revision/commitment intents and supports a simulated device fence. Ten `node:test` cases passed, covering CAS/idempotency, full-local-snapshot rollback detection, commitment mismatch, competing revision writes, idempotency-key collision, stale fences, false signatures, wrong account/binding, revoked device, service outage, signing-context separation and invalid enrollment metadata.

**A green reference test does not mean a trusted checkpoint service exists.** All storage is transient RAM, enrollment is an unauthenticated fixture, and there is no real Solana wallet/GNS ownership validation, durable database, TLS API, credential revocation integration, or independently trusted root at runtime.

## Files and code boundary

- `openmls-poc/src/outbox_spike.rs`: real OpenMLS 0.9.2 `create_message` + serialized MemoryStorage state and encrypted outbox inside one WebCrypto AES-GCM/IndexedDB transaction, Web Locks admission and revision CAS. Test-only; both fixture participants' secrets reside in one snapshot.
- `openmls-poc/browser-test/outbox-runner.mjs`: real Chromium two-tab contention, forced transaction abort, lost-response-after-commit, entire-process restart and recipient recovery.
- `openmls-poc/checkpoint/monotonic-checkpoint.mjs`: **in-memory** Ed25519-verified high-watermark/lease prototype, not a production authentication server.
- `openmls-poc/checkpoint/monotonic-checkpoint.test.mjs`: ten signed checkpoint contract tests.
- `.github/workflows/gwap-messenger-outbox-locks.yml`: test-only GitHub workflow (read-only repository permissions; no secrets, mainnet RPC or deployment).
- `docs/GWAP_MESSENGER_ADR_0002_ATOMIC_OUTBOX_AND_ROLLBACK.md`: proposed production safety design and sequencing.

## Release blockers NOT solved by this spike

- **Production OpenMLS StorageProvider:** raw MemoryStorage snapshot is a testing shortcut. MLS private secrets are copied through WASM/JS memory and serialized into a browser-controlled encrypted snapshot; absent zeroization, secure backup management, or an audited transactionally consistent adapter.
- **Independent rollback checkpoint:** implemented ONLY as in-memory authenticated-request tests, not a persistent, fail-closed server. Entire IndexedDB rollback remains possible without an authenticated high-watermark from outside the local profile. Reject externally stale state before any future network envelope release.
- **Real crash/power-loss failure:** injection was a synthetic transaction abort and post-commit reply exception, followed by a clean Chromium process restart. Arbitrary OS kill, power loss, quota/storage eviction, transaction flush semantics and actual device compromise remain untested.
- **Real transport and fencing:** no backend DS, network retries/deduplication, real authenticated lease or sender ratchet send gating tested across GwapOS or across devices.
- **XSS/security review:** `CryptoKey.extractable=false` does not protect if same-origin scripts or extensions can invoke WebCrypto; CSP/Trusted Types/supply-chain review needed.
- **Identity:** fixture names are not live `.gwap` domain proofs; no Solana authoritative ownership, wallet/device enrollment, transfer rekey or signed credentials from GNS.
- **Mobile:** no actual iPhone Safari test. Earlier desktop Safari job was canceled, not passed.
- **User approval:** no PR merge, main branch update, Vercel preview, public E2EE claim or production deployment authorized or executed.

## Proposed next order

1. Design a durable, authenticated per-device checkpoint service: persistent conditional writes, testable fencing, binding version and idempotency, with explicit offline behavior and privacy limits.
2. Review transaction boundaries, replace raw `MemoryStorage` serialization with supported OpenMLS storage adapter, and perform kill/quota/failure-injection tests before sending network ciphertext.
3. Validate on real iPhone Safari using a separately authorized isolated HTTPS test surface, then verify live devnet GNS ownership and domain transfers.

**Conclusion:** We now have reproducible evidence that sender state + encrypted outbox can be committed together, survive a lost response and clean Chromium restart, and reject contending browser tabs in a test environment. **Do not equate this with production E2EE readiness.**