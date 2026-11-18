# GWAP Messenger — Independent Browser Clients, OpenMLS KeyPackage / Welcome / Commit

**Date:** November 17, 2026.  
**Branch:** `test/gwap-messenger-two-client-mls-20261117`.  
**Verified CI:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44207121839 — **SUCCESS** (native 1/1; WASM build; two independent Chromium clients, all 8 logged assertions).  
**Canonical tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341.

## Objective and architecture

Demonstrate genuine MLS cryptography between **separate Chromium processes and persistent browser profiles**, not Alice/Bob in one OpenMLS provider. The browser-only Rust/WASM client code creates separate `OpenMlsRustCrypto` providers and separate `SignatureKeyPair`s in each browser process, so neither party's OpenMLS secrets are serialized to the loopback relay or transferred into the other's client.

Each device additionally generates an independent non-extractable **WebCrypto Ed25519 relay-signing key** in its own browser. The Node loopback relay enrolls these public fixture device keys using a privileged local test-runner action (NOT authoritative GNS proof). It verifies signed, domain-separated send/pull requests, rejects repeated nonces, and only delivers serialized MLS KeyPackage, Add Commit metadata, Welcome, staged Commit, and PrivateMessage bytes in a fixed event order. No group secrets or plaintext traverse the relay.

## Test phases

1. Bob generates and publishes a real KeyPackage; Alice pulls the exact bytes through a signed relay request. A forged client cannot read Alice's inbox.
2. Alice validates Bob's KeyPackage using OpenMLS and creates the group. Relay transmits the initial Add Commit and Welcome in that order; Bob joins only from the Welcome. Both clients derive matching epoch authenticators with two members.
3. Alice sends encrypted MLS application ciphertext to Bob, who tests tamper rejection, successful decryption and replay rejection. Bob independently sends a reply, which Alice decrypts.
4. Bob stages an MLS self-update Commit. The relay delivers it to Alice; Alice validates/merges it and Bob merges his pending Commit after relay acceptance. Both compare their new epoch authenticators.
5. Both clients exchange fresh encrypted messages in the new epoch, with no cross-profile private-key sharing.
6. Fixture relay rejects a repeated KeyPackage and a sender spoof using another device's signing identity.

**Verified from the completed GitHub Actions job log:** the runner emitted `result: PASS` in "two independent Chromium profiles + real OpenMLS WebAssembly + signed loopback relay", with **8 of 8 logged integration assertions passing**. The native Rust regression also passed (1/1), and `wasm-pack build --release --target web` succeeded. No independent-device persistence, real GNS binding or production Delivery Service was exercised.

## Eight executed integration checks

1. Two distinct Chromium browser processes/profiles and OpenMLS private providers, each with browser-generated nonextractable Ed25519 relay key.
2. Bob serialized and published a genuine KeyPackage; Alice retrieved it through an authenticated relay. A forged inbox read was denied.
3. Alice verified Bob's KeyPackage using OpenMLS, created a group, and relayed an initial Add Commit before Welcome. Bob joined from Welcome, verified a two-member roster and matching epoch authenticator. A repeated KeyPackage attempt was rejected.
4. Alice's OpenMLS PrivateMessage traversed the relay and decrypted in Bob's independent profile. Tampered wire and consumed-key replay were rejected.
5. Bob encrypted a reply from his independent provider; Alice decrypted it.
6. Bob staged and transported an actual MLS self-update Commit; Alice validated/merged it and Bob merged his accepted pending Commit. The resulting epoch authenticator changed and matched on both devices.
7. New-epoch messages encrypted and decrypted in both directions.
8. Attempted sender impersonation using the other fixture's device ID was rejected; the relay recorded eight typed opaque wire events without MLS private keys.

**Known nonclaim:** test-only transport signing keys are not bound to the OpenMLS signing identity or to a real GNS wallet/domain-ownership assertion.
## Important nonclaims

- **Distinct test browser profiles are not independently verified real GNS identities.** The relay's privileged enrollment maps only fixtures `alice` and `bob` to device Ed25519 public keys. There is no wallet signature, authoritative `.gwap` current owner, domain transfer, identity transparency, key transparency, contact consent, or verified binding of the relay key to the MLS BasicCredential.
- **Not durable MLS client state.** The independent-client module's OpenMLS providers live only in each browser process's WASM heap. It deliberately does not promise page/browser restart recovery, IndexedDB state preservation, hardware key isolation or secure deletion of keys. Earlier single-browser persistence tests do not imply these independent clients have persistence.
- **Not a production Delivery Service.** The loopback relay is volatile, event-order limited and two-member specific. There is no PostgreSQL-backed canonical Commit log, transactional outbox, authenticated delivered receipts, MLS KeyPackage expiry/consumption policy beyond the fixed test sequence, async offline sync, group membership authorization, rate limiting, retention or abuse prevention.
- **No public end-to-end encryption claims.** The tests use OpenMLS 0.9.2 for real message cryptography but bypass production onboarding, device recovery, GNS control and security review.
- **No iPhone Safari**. Headless Chromium on a GitHub Linux runner cannot establish iOS WebKit/PWA compatibility.

## Next gates, if the independent-client test is green

1. Bind device relay signatures **and** MLS credential signatures to signed, current `.gwap` GNS ownership on Solana devnet, including transfer denial/rekey.
2. Use independent clients with a persistent, reviewed OpenMLS StorageProvider, secure key-rotation/deletion semantics and crash/rollback-aware outbox.
3. Replace the in-memory ordered relay with a persistent, authenticated, canonical Proposal/Commit/Welcome ordering service, enforce contact consent and server-authoritative idempotency.
4. Run actual separate devices and iPhone Safari acceptance in a separately authorized, access-controlled test environment.
5. Commission an independent security review before considering main-branch merge or production deployment.

**No merge/deploy/preview authorization is implied by this test.**