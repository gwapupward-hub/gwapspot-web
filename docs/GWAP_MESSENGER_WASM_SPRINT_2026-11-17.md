# GWAP Messenger · OpenMLS WebAssembly sprint test report

**Date:** 2026-11-17  
**Scope:** Isolated test branch only; no GwapOS integration, merge, mainnet action or production deployment.  
**Branch:** `test/gwap-messenger-openmls-wasm-20261117`  
**Issue:** [#341](https://github.com/gwapupward-hub/gwapspot-web/issues/341)

## Verified CI evidence

| Attempt | Link | Outcome |
| --- | --- | --- |
| First WASM attempt | [run #44149783840](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44149783840) | Native passes; WASM compile blocked by `getrandom 0.2` missing JS entropy feature |
| Corrected WASM run | [run #44150080054](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44150080054) | **Success: all three environments completed** |

**Corrected-run GitHub Actions log:**
- Rust native: `1 passed; 0 failed`.
- Node WebAssembly: `2 passed; 0 failed`. Main MLS encryption test passes; browser-capability test returns early because Node has no `window`.
- Headless Chrome WebAssembly: `2 passed; 0 failed`; genuine headless Chromium test runner on localhost with browser `window.crypto` and `window.indexedDB` availability assertions.
- Pinned cryptographic implementation: OpenMLS **0.9.2**, `openmls_basic_credential 0.6.0`, `openmls_rust_crypto 0.6.0`; MLS cipher suite `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.
- Native and WASM test operations: separate fixture users, real OpenMLS KeyPackage/Welcome, 2-member group, encrypted bidirectional PrivateMessage exchange/decryption, self-update Commit / new epoch authenticator match, replay rejection, tampered ciphertext rejection, and **MlsGroup::load** after dropping the group with the **same in-memory storage provider**.
- First failure fixed by declaring `getrandom = { version = "0.2", features = ["js"] }` in target-specific WASM dependencies, enabling the browser/Node secure randomness API. No custom cryptographic primitives were added.

## What these tests do NOT establish

**The following remain unverified and must never be described as completed:**
- Full webpage refresh, tab close, process restart or device restart with durable **IndexedDB-backed OpenMLS state**, protection of stored keys and rollback/replay resistance.
- Storage encryption at rest, key-wrapping/recovery, hardware-backed key behavior or security against XSS/same-origin malicious JavaScript. Browser API availability does **not** prove a secure persistence implementation.
- Real iPhone Safari (mobile Apple WebKit), private browsing or storage-eviction testing.
- GNS onchain domain ownership, wallet/device-credential signatures, rotated/expiring KeyPackage directory, transfer/revocation, authoritative DS, queue and server/client integration.
- Durable ordered Commit/Welcome handling with intermittent networks or concurrent devices, key transparency, security review or any end-user E2EE product.
- Post-quantum or hybrid MLS suites and proof issuance.

## Recommended next test milestone: real durable client state

1. Choose a reviewed storage adapter compatible with OpenMLS's `StorageProvider` semantics and browser asynchronous IndexedDB. Evaluate OpenMLS `async` feature / JS bridge rather than blocking UI threads or exporting secrets casually.
2. Protect confidentiality **and integrity** of stored group state: evaluate WebCrypto key wrapping, nonextractable key usability, key origin restrictions, secure logout/device reset, schema migration, version counters and rollback protections. Explicitly document limitations under XSS and compromised devices; do not assert that nonextractable keys defeat same-origin compromise.
3. Test encrypted state persistence across full reload and browser restart in Chromium; group resumes with correct epoch, no reused nonce/generation, can decrypt the next valid message; tampered and stale records fail closed.
4. Build a separate HTTPS, access-controlled test page or test artifact for actual iPhone Safari manual acceptance. Track Safari WebCrypto/WASM, IndexedDB quota/eviction, background suspend, offline sync, private mode and recovery UX.
5. Integrate live devnet GNS ownership/device credential proof only after cryptographic storage behavior is tested, and preserve transfer-as-new-identity semantics.

**Release boundary:** do not merge into `main`, deploy any production app, or advertise a working secure GWAP Messenger until owner approval + complete safety gates.
