# GWAP Messenger — isolated OpenMLS crypto spike

**Scope:** test-only, not production E2EE. This branch is intentionally isolated from the GwapOS runtime, API routes, deployment configuration, and app navigation.

## What the Rust test exercises

- OpenMLS 0.9.2, pinned with the mandatory MLS 1.0 cipher suite
  `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.
- Alice and Bob use separate cryptographic providers and BasicCredential fixture identities.
- Bob publishes a real library-generated KeyPackage. Alice creates a group, adds Bob and generates a Welcome.
- Both sides derive the same MLS epoch authenticator after joining.
- Both sides exchange OpenMLS PrivateMessages and decrypt the correct plaintext locally.
- Bob creates a self-update Commit; Alice processes it; both reach the same new epoch and decrypt another message.

## What this does NOT prove

- Live GNS/.gwap domain ownership, Solana wallet/device binding, KeyPackage directory security.
- Browser/WebAssembly/iPhone Safari execution, encrypted-at-rest client state, crash recovery.
- Server-side transport/security/production deployment, push notifications, group scale or a third-party security audit.
- Robustness under malicious server, replay, corrupted Commit or multi-device scenarios.

GitHub Actions runs this test on **Linux/native Rust**, not in WASM. Only a green CI job is evidence for the *native* crypto test.

## Run locally

```sh
cargo test --manifest-path openmls-poc/Cargo.toml --lib -- --nocapture
```

## Safety boundary

No production source or default branch changes, and no secrets are required.
Do not merge or deploy this POC; require separate owner signoff after test evidence.
See [Issue #341](https://github.com/gwapupward-hub/gwapspot-web/issues/341).
