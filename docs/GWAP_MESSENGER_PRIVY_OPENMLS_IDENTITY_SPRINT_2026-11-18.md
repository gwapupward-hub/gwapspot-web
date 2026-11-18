# GWAP Messenger — Privy/GwapOS Identity + Cryptographically Validated OpenMLS Device Sprint

**Date:** November 18, 2026 · **Status:** Isolated test integration **PASS**, NOT production-enrolled.

**Branch:** `test/gwap-messenger-privy-mls-identity-20261118`
**Canonical issue:** https://github.com/gwapupward-hub/gwapspot-web/issues/341
**Verified final CI:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44250999855
**Native crypto-specific CI:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44250151835

## Decision and scope

The previous step established independently corroborated finalized `roadmap.gwap` ownership-history evidence on two devnet RPC providers. This sprint addresses the next independent trust boundary: **authenticated GwapOS account ↔ wallet-signed device authorization ↔ actual MLS cryptographic credential**. No real owner-wallet signature was requested or simulated as user consent; all tests use generated fixtures.

### GwapOS session integration seam

- `app/lib/messenger-verified-session.ts` — new unreferenced, server-only *read-only* adapter; calls existing `getAuthenticatedWalletIdentityResult(request)` (Privy token verification) and `getGwapAccountForWallet` (Redis canonical account mapping). Does not mint a separate Messenger login, create accounts, send HTTP responses or register API routes.
- `app/lib/messenger-verified-session-core.ts` — strict, independently testable session decision. Requires Privy user ID to be mapped to the canonical `gwap_...` account, matching primary verified Solana wallet and an existing account-wallet relationship. Missing account, disconnected/replaced wallet, stale mapping and unavailable authentication fail closed.
- `app/lib/messenger-verified-session-core.test.mjs` — **6/6 PASS** in GitHub Actions.
- Full GwapSpot `npm run typecheck` **PASS** for the isolated branch; no existing GwapOS route, component, authentication or production file was edited.

### Actual OpenMLS KeyPackage validation

- `openmls-poc/src/identity_validation.rs` — uses **OpenMLS 0.9.2** `KeyPackageIn::tls_deserialize_exact` and `validate` to authenticate actual KeyPackage/LeafNode signatures under the pinned MLS 1.0 Ed25519 ciphersuite.
- Requires canonical **signed BasicCredential identity**: `GWAP-MLS-IDENTITY-V1|gwap_<20–64-character ID>|device_<3–80-character ID>`. Rejects packages from a different GWAP account/device, a tampered signature, trailing TLS bytes and unsupported/malformed identities. Extracts only public MLS signing-key evidence (no private keys).
- `openmls-poc/src/bin/gwap-mls-keypackage.rs` — disposable native CLI for generating real public test KeyPackages and verifying serialized public package bytes; not approved as a production subprocess or deployed crypto service.
- `openmls-poc/gns-binding/native-mls-keypackage-verifier.mjs` — fail-closed test-only bridge to the trusted native verifier with strict output assertions and bounded input/time.
- `openmls-poc/gns-binding/gwapos-wallet-mls-enrollment.mjs` — now **requires** an injected cryptographic verifier on construction and rechecks the signed credential both **before issuing the wallet-signature challenge** and **immediately before durable SQL enrollment**.
- `openmls-poc/gns-binding/gwapos-wallet-mls-enrollment.test.mjs` — existing 14 synthetic tests plus three denial regressions; **17/17 PASS**. Existing dummy packages are explicitly marked as mocks; **not** used to claim cryptographic validation.
- `openmls-poc/gns-binding/native-mls-enrollment.test.mjs` — **2/2 PASS** using actual newly generated OpenMLS-signed KeyPackages passed through the wallet-signature challenge and disposable PostgreSQL 16 device registry, plus mutation, cross-account/device mismatch, and consumed challenge rejection.

## Verified GitHub Actions

| Gate | Result |
| --- | --- |
| Native Rust crypto/KeyPackage tests, including previously passing OpenMLS group regression | **6/6 PASS** |
| Simulated session/wallet-signature + durable SQL enrollment and revocation contract | **17/17 PASS** |
| Actual signed native OpenMLS KeyPackage through Node challenge and isolated PostgreSQL device admission | **2/2 PASS** |
| Real GwapOS session-to-existing-account authorization decision (pure contract) | **6/6 PASS** |
| Full application TypeScript compiler (`npm run typecheck`) | **PASS** |
| **Automated test count** | **31/31 PASS, zero failures** |

**Source of truth:** the completed GitHub Actions run #44250999855 reports all three jobs successful. The earlier native CI #44250151835 passed separately. Initial native CI #44249929383 failed solely due to a test script using the wrong Cargo output path; corrected and reverified.

## Security nonclaims / release blockers

1. **No real GwapOS session invoked**: the new server adapter is intentionally unreferenced, and the Node end-to-end test injected a fake authenticated Privy session. Typechecking cannot prove a live Privy cookie/token, Redis account, wallet ownership or browser-origin policy.
2. **No live wallet prompt or signature**: test Ed25519 wallets are generated in GitHub Actions. Only a separately authorized devnet pilot should call the actual wallet adapter `signMessage`, using a trusted same-origin, rate-limited endpoint and explicit user consent. Never request seed phrases, wallet private keys, or transactional signatures.
3. **No production MLS client creation flow**: this native KeyPackage fixture uses the correct signed BasicCredential, but the independent browser clients still use fixture credentials (`alice.gwap:fixture-device`). Browser-generated canonical `GWAP-MLS-IDENTITY-V1|...` credentials must be validated by this verifier in a separate two-device end-to-end test before user rollout.
4. **No production key custody, delivery, or user discovery**: the test-only native subprocess and in-memory challenge attempts are not production-ready. Production requires trusted code-integrated verification, persistent one-time challenge state, session/CSRF protection, device-key proof, consent and block controls, portable identity revocation, storage deletion and crash/rollback safety.
5. **GNS history evidence**: two independent devnet RPCs matched `roadmap.gwap` on owner/registration/zero observed transfers. `archiveCompletenessProven=false` because GNS V2 has no monotonic on-chain transfer counter; production requires a documented trust model and live high-watermark/transfer feed.
6. **Release gates**: actual iPhone Safari/Privy compatibility, mobile device-key persistence, independent security review, real data-retention and abuse controls, and a separately approved migration of retired `6cDC` program references in the existing GwapSpot application.

## Recommended next sprint

**P1 — Browser-originated OpenMLS identity + consented devnet pilot design.** Update the isolated browser device fixture to generate an authenticated canonical GWAP account/device BasicCredential, verify its public KeyPackage using the tested native validator, and demonstrate one-time key publication bound to a simulated Privy/GwapOS session. Write and test dev-only API origin/rate-limit/error behavior, not production deployment.

**P2 — Access-controlled pilot approval gate.** Review proposed devnet host, actual GwapOS session handling, wallet UX and one-time challenge storage. Do not activate actual user-wallet signing until separately approved.

**P3 — MLS StorageProvider + durable delivery and Safari.** Replace experimental raw MemoryStorage snapshots, test recipient revocation and real iPhone Safari, and commission third-party security review before any main merge or public E2EE claim.

**Isolation check:** branch contains only new/test modules, focused workflows and docs. No production merges, Vercel Preview/production deploys, live Neon writes, real wallet signing or Solana transactions were performed.