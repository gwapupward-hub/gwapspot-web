# GWAP Messenger — Canonical GNS V2 Finalized Ownership + Durable Device Registry

**Date:** November 17, 2026 (CI checks ran November 18 UTC)
**Branch:** `test/gwap-messenger-gns-v2-finalized-20261117`
**Status:** **PASS for isolated finalized-history security contract and PostgreSQL tests**. NOT live name-transfer proof, nor authorized for production.
**Canonical tracker:** https://github.com/gwapupward-hub/gwapspot-web/issues/341
**Verified final CI:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44225448062

## Crucial canonical GNS program correction

The user explicitly confirmed the canonical **GNS V2 devnet program**:

`A9SCN6tgaoAEorFzY5ZPinruk8LCttmrAEU9JoAmUKUH`

The former program `6cDCrNYmasd1qmnvdLf8jyt9iFa3jW9VLzJhrb7X7SEH` is **retired**; the GNS repository's deployment runbook calls it compromised because its upgrade authority was exposed. NEVER authorize device enrollment against 6cDC. Source: https://github.com/gwapupward-hub/GNS-decent-deploy/blob/main/docs/gns-v2/deployment-runbook.md . The canonical Rust `declare_id!` and on-chain NameRecordV2 layout are in `GNS-decent-deploy/programs/gwap_names/src/{lib.rs,state.rs,events.rs,normalize.rs}`.

**Live, read-only confirmation:** The optional public devnet RPC step passed twice. On final CI, Solana devnet genesis matched `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` and the A9SCN6 account was **executable at finalized slot 523483703**. No name, owner wallet, transaction history or upgrade-authority/binary attestation was checked by this smoke test.

## Actual CI results

| Suite | Result |
| --- | --- |
| Existing wallet-signed GNS device binding contract, updated to A9SCN6 | **9 passed / 0 failed** |
| New finalized V2 account/PDA/transfer-history verifier with mocked RPC | **15 passed / 0 failed** |
| Strict verifier-to-device binding, including A→B→A with same final owner | **3 passed / 0 failed** |
| New ephemeral PostgreSQL 16 durable GNS device/nonce/owner generation tests | **10 passed / 0 failed** |
| **Total** | **37 passed / 0 failed** |
| Optional real devnet A9SCN6 executable preflight | **PASS** |

### Finalized history verifier

`openmls-poc/gns-binding/gns-v2-finalized.mjs` implements a read-only, fail-closed adapter using `@solana/web3.js`:

- ASCII-only canonical normalization consistent with current GNS policy, `SHA-256('gns:name:v1' || 0x01 || canonical_name)` and `[b'name_v2', 32-byte hash]` PDA under **A9SCN6**. `papi.gwap` hash is pinned to the canonical GNS Rust/TypeScript cross-language vector `4721516c98a98966990f9ce7398316e003f1f50958ad25ef5822d506ba4770b9`.
- Read-only RPC `getGenesisHash`, `getAccountInfoAndContext` with **finalized** commitment, `getSignaturesForAddress`, and `getTransaction` of the name PDA. Verifies executable GNS V2 program, owner program, Anchor account discriminator, owner pubkey, canonical full name, hash, normalization version, PDA bump, and active name expiry.
- Requires full indexed transaction history to a matching NameRegisteredV2 or NameMigrated origin; checks ordered NameTransferredV2 old/new owner chain and recreations/rollbacks. A→B→A yields the same owner but a **different ownershipVersion**. Transfers are derived from Anchor `Program data:` under the actual A9SCN6 program invocation, not from untrusted CPI logs.
- Rejects missing/pruned transaction data, wrong program/network, unsupported normalization, inconsistent events/owner, history bound exhaustion, changed account contents during scan or changed latest signature. **An owner-only `/resolve` result is not proof**.

**Caveat:** This is an RPC-consistency and complete-history design test, not a cryptographic Solana light-client proof. To use it on a real name, an archive-quality finalized RPC must actually return every relevant transaction/event without gaps. `NameRecordV2` contains NO transfer counter. Until fully observed live name history works, any name needing this proof remains unverified and should fail closed.

### Durable PostgreSQL device-binding reference

`openmls-poc/gns-binding/pg-gns-v2-{schema.sql,directory.mjs,directory.test.mjs}` implements a disposable PostgreSQL registry, **not deployed to Neon or GNS**:

- Verifier proof is obtained **inside the server from a trusted injected reader**, never supplied by the browser as authoritative data.
- Durable per-name owner wallet, finalized high-water slot, creation signature, transfer-count commitment and monotonically advancing **binding generation**.
- Controlling-wallet Ed25519 enrollment signature binds the correct devnet/program, current name, immutable GWAP account ID, unique device ID, transport Ed25519 key, exact MLS KeyPackage SHA-256, server-issued challenge, and expiry.
- Transfer history/owner changes revoke all prior device rows in PostgreSQL. The database synchronization is committed **before** checking an old device action so a failed unauthorized request cannot roll back a revocation. The same-owner A→B→A case was tested.
- Consumed challenge and signed action nonces persist; a new alias owner cannot claim the former owner's stable GWAP account. Two independent SQL connections observe revocation and replay denials. Stale finalized slots and contradictory transfer-count regressions are rejected.

**Test correction history:** Initial PG suite uncovered a name-label/full-name mismatch and then revealed a real transaction-boundary flaw where a denied action rolled back revocation. Both were corrected on this test branch. The final run #44225448062 passed all 37 tests.

## Explicit release blockers

1. **No actual registered `.gwap` name was tested** on devnet. Public A9SCN6 executable status does not prove complete ownership/transfer history or its archival availability. Need an owned devnet test name and (optional) public wallet for an external audit against finalized RPC history.
2. **No live GwapOS canonical account identity:** simulated Ed25519 wallets and chosen `gwap_...` IDs remain fixtures. The durable registry is an isolated reference and must be integrated with verified wallet sessions, real GNS and independent MLS credential validation.
3. **No onchain transfer counter:** Account currently stores `owner`, resolver, name hash and lifecycle metadata but no strictly increasing transfer generation. History-based proof requires lossless archive access; evaluate program-level monotonic ownership counter only under separate onchain-upgrade review and approval.
4. **No production rollback service:** durable registry tests use a disposable PostgreSQL 16 container, not secured PostgreSQL/Neon roles, migrations, authentication, backups, monitoring or real in-service owner verification.
5. **No production MLS StorageProvider, iPhone Safari, independent audit or canonical persistent Welcome/Commit delivery service.** The previous browser proof uses test-only OpenMLS memory snapshots; this sprint does not ship it.
6. **Main web app still requires separate canonical program migration review:** existing `app/app/lib/gns.ts` and `app/app/lib/gns-registration.ts` refer to 6cDC in the reviewed state. This branch only changes isolated messenger fixtures; it does not alter the public GNS integration or authorize live changes.

## Recommended next safe actions

1. Run the finalized-history verifier against one confirmed existing GNS V2 devnet name using an archive-capable RPC, validate transfer signatures back to account creation and compare latest owner with the GNS backend. Fail closed if archive history cannot be proven complete.
2. Link the durable device directory to a verified GwapOS account + authorized wallet session and validate OpenMLS KeyPackage credential signatures instead of only checking the digest.
3. Establish a separate planned PR for removing old compromised `6cDC` references from the live GwapSpot GNS integration, with owner approval and backend cutover tests.
4. Review persistent MLS client storage and complete real iPhone Safari device testing before any user messaging release.

**Approval boundary:** Entire sprint is read-only with respect to Solana and test-only in GitHub. No actual Solana transactions, mainnet activity, production DB operations, Vercel previews, branch merge or public release occurred.