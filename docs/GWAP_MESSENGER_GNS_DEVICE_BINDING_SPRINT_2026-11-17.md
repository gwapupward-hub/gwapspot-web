# GWAP Messenger — GNS Device Enrollment / Transfer-Isolation Security Sprint

**Date:** November 17, 2026 (GitHub Actions UTC timestamps may show November 18)  
**Branch:** `test/gwap-messenger-gns-device-binding-20261117`  
**Canonical tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341

## Purpose

Prove the **policy** that a `.gwap` domain's current verified wallet must authorize its own MLS KeyPackage and browser transport device, and that a name transfer makes former-owner device requests fail closed. Tests are isolated; no user wallet or production GNS record is used.

## Existing repository ownership boundary reviewed

- `app/app/lib/gns.ts::resolveGnsName(name)` reads the configured GNS backend `/resolve/{name}` with `cache: no-store` and a timeout; it returns only `{ found, owner }` or `null` on error.
- `app/lib/gwap-browser-ownership.ts::verifyLiveGnsOwnership` requires a live resolver record whose `owner` equals the authenticated verified wallet, and fails closed on absent/unavailable/mismatched ownership.
- `app/app/lib/gns-registration.ts` pins GNS registrations to **Solana devnet**, network genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` and program `6cDCrNYmasd1qmnvdLf8jyt9iFa3jW9VLzJhrb7X7SEH`. This sprint reuses those values for wallet authorization domain separation.

**CRITICAL SOURCE LIMITATION:** the current GNS `/resolve` read path returns no chain account data, finalized slot, transfer event sequence, owner-revision number or verifiable chain proof. A server relying only on `{found,owner}` CANNOT guarantee detection of an unobserved A→B→A transfer. This sprint proves behavior against an **injected mutable resolver fixture**, NOT live finalized onchain ownership.

## Binding contract implemented in the isolated test branch

Files: `openmls-poc/gns-binding/gns-device-binding.mjs` and `.test.mjs`. A server-issued one-time, short-expiry nonce and a Solana-style Ed25519 controlling-wallet signature bind:

- domain name, `devnet` network, expected GNS genesis and program;
- current `.gwap` owner wallet, stable `gwap_...` account and unique `device_...` identifier;
- device's browser-generated Ed25519 transport public key;
- SHA-256 digest of its MLS KeyPackage bytes;
- challenge nonce and expiration.

Every subsequent test relay action also requires an independently signed, domain-separated request binding the current `.gwap` owner, stable account, device, local observed ownership generation, action type, opaque payload hash and a fresh nonce. The gate always re-queries the injected GNS resolver and rejects stale owner/device bindings or resolver outage.

On an **observed** owner transfer, older bindings are marked revoked. The new owner must enroll a fresh device and KeyPackage, and may not reuse the previous owner's stable GWAP account ID. The original canonical account and its historical messages are not reassigned merely because the alias changes owners.

## Evidence

- Node 24 wallet-owner transfer-contract CI: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44210996661 — **9 passed, 0 failed**; amended contract additionally bars new owner from old stable account.
- **Final browser integration CI: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44212236507 — SUCCESS.** Native OpenMLS regression 1/1, browser WebAssembly compilation, and **9/9 independent-client integration assertions** passed. Separate Chromium profiles generated independent nonextractable Ed25519 test-wallet and relay keys and signed genuinely generated OpenMLS KeyPackage hashes; relay authenticated first contact, Add Commit before Welcome, MLS ciphertext in both directions, a self-update Commit, new epoch messages, and spoof/replay/tamper rejection. An injected resolver transfer rejected former-owner send/pull, required a new wallet/device/KeyPackage and stable account, and denied new owner access to the old relay's encrypted messages. Note: actual GNS devnet finality was NOT checked.


### CI failure / fix history

- First browser attempt [#44211707378](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44211707378) executed to the sender-spoof assertion, where the server correctly rejected a forged role with `Domain/relay role mismatch`. The test expected the old `Invalid relay signature` wording; the assertion was corrected without relaxing server checks.
- Corrected [#44212236507](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44212236507) completed successfully. The final GitHub Actions log emitted `result: PASS` with 9 integration assertions, including owner-transfer isolation and a new owner unable to retrieve the old inbox.
- The amended Node wallet-binding contract, including the rule that a new alias owner cannot inherit the old canonical account ID, passed [#44211707337](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44211707337): **9/9 passed**.
## What is NOT verified and must block release

1. **No real chain/ownership finality:** there was no direct Solana devnet PDA decode, finalized account read, transfer transaction or verified transfer event in the CI tests. GNS backend `/resolve` is currently an *owner-only* read, not an attested ownership-version oracle. Must design a trusted, monotonic finalized authority before public device enrollment.
2. **No real wallet enrollment:** browser tests create disposable Ed25519 key pairs through WebCrypto, not authenticated Phantom/Privy Wallet Standard sessions or Sign-In with Solana. A caller-controlled `gwap_...` account ID is NOT proof of ownership of an existing canonical GwapOS account.
3. **MLS proof validation gap:** binding checks the exact signed KeyPackage *hash*, and a separate OpenMLS recipient validates the KeyPackage before joining; the Node enrollment gate itself does not decode/verify the KeyPackage signature or prove that its credential contains a canonical device ID. Add server-side OpenMLS-aware validation / independently attested KeyPackage metadata before release.
4. **No stable production persistence:** the gate stores challenges, account-owner associations, nonce replay data and revocation generations in memory. A process restart loses these protections. Use an authenticated, transactional PostgreSQL device/identity registry, not this class directly.
5. **No GNS event-gap coverage:** owner-only polling can miss A→B→A if transfer and return happen between checks. Production needs finalized ownership revision/transfer receipt sequencing; unknown, delayed or stale ownership must fail closed.
6. **No durable customer delivery:** the loopback relay is in-memory and uses fixed fixture aliases. Real `.gwap` ownership must authorize the PostgreSQL authenticated Delivery Service's KeyPackage, Welcome, Commit, send and recipient fetch operations at every relevant boundary, including pending/offline messages.
7. **No production MLS state custody or actual iPhone Safari:** the independent browser test stores its MLS secret state in memory. A reviewed, persistent OpenMLS StorageProvider, secure deletion, crash/rollback tests and real-device iOS acceptance remain mandatory.

## Minimum next production-directed test

Build a read-only verified GNS devnet ownership adapter with finalized slot + name-account ownership decoder and an authenticated, monotonic transfer generation. Feed those facts to a durable PostgreSQL account/device-binding model tied to actual GwapOS sessions and validated MLS credentials; test transfer, rollback and offline retry. Do not authorize messaging when ownership finality cannot be proven.

**Release boundary:** isolated GitHub branch/workflows only. No main merge, Vercel preview, production release, mainnet action, or public E2EE claim.