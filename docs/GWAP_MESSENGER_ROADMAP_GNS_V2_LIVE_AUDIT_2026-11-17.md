# GWAP Messenger — `roadmap.gwap` real finalized GNS V2 read-only audit

**Test run:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44235749879
**Date:** 2026-11-17 US Eastern / 2026-11-18 04:13 UTC
**Branch:** `test/gwap-messenger-roadmap-live-gns-v2-20261117`
**Scope:** public read-only Solana devnet RPC. No signature request, private key, network transaction, DB mutation, Vercel preview, or deployment.

## Measured finalized chain facts

| Check | Evidence |
| --- | --- |
| User-supplied GNS name | `roadmap.gwap` |
| Network | Solana **devnet**, genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` |
| Canonical V2 program | `A9SCN6tgaoAEorFzY5ZPinruk8LCttmrAEU9JoAmUKUH` (executably deployed) |
| Derived PDA | `EmzaYXdX33QkUCVU8xqcRqot5KD4q3baQuxaiFgRBFqo` |
| Canonical name hash | `4dfd7bfcf3d8d59a420815c91d208beab00cafc1e072333e0214352e3817b3da` |
| Finalized GNS account | Present; owner program A9SCN6; 400-byte `NameRecordV2` decodes and matches canonical name, hash, bump and version |
| Public owner wallet in name record | `58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV` |
| Record resolver target | System default/zero key, indicating ordinary owner resolution |
| Program/name-account finalized read slot | `523505828` |
| Finalized history reconciliation slot | `523505832` |
| Name expiration | Record unexpired when tested |
| Observed finalized signature history | **One** entry, corresponding to original registration |
| Observed transfers | **Zero** in the RPC's returned history |
| Creation transaction | `4Ru9DcAj5xvFLD3yrsQbpREuLRjqXHzMF6hin2tEnwQvBhi26PzRha4FWZJiFfsFdjy4z46oCsndDR5AH9n62GiF` |
| Derived ownership version | `22a071adfb4b256e105401c219879199372d4a8b5e902fd28a1c80ccb5ce77b3` |
| Verifier result | `FOUND_VALID_V2_RECORD` and `HISTORY_CONTRACT_VERIFIED_ON_THIS_RPC` |
| Messaging authorization | **FALSE** (explicitly not enabled) |

Explore derived name PDA: https://explorer.solana.com/address/EmzaYXdX33QkUCVU8xqcRqot5KD4q3baQuxaiFgRBFqo?cluster=devnet

## How verified

The test used `openmls-poc/gns-binding/roadmap-live-gns-v2-audit.mjs` plus the previously regression-tested `gns-v2-finalized.mjs` with read-only Solana RPC methods. It pinned the devnet genesis, required executable canonical A9SCN6, derived the PDA from the canonical V2 name hash, decoded the finalized Anchor record, checked name/owner/expiry and paginated the finalized signature history for that PDA. The verifier retrieved a registration event, reconstructed the owner state, compared with current on-chain owner, repeated the finalized account read, and verified its most recent signature remained unchanged.

## Accuracy boundaries

- `transferCount: 0` means **no transfers in the one historical transaction returned by this public RPC**. This is a strong read-only result but **not a proof that an independent archive node also has a lossless history**. A public RPC can prune or incompletely serve older signatures. Reproduce on an independent archive-quality finalized RPC before trusting an ownership epoch for production.
- The owner wallet is what the public on-chain name record contains. **The user has not independently established that they control this public wallet**. That requires a deliberate, wallet-signed challenge through GwapOS.
- The GNS `/resolve` endpoint used by existing website code is not a substitute for this direct finalized owner+history check and has no monotonic transfer counter. No live GwapOS GNS app files were changed by this test.
- The `NameRecordV2` account does not itself expose an increasing transfer count. The version is derived from the registry creation signature and reconstructed transfer-event sequence; protect against archive gaps, future runtime upgrades, and identity transfer/re-creation.
- This does not authenticate any MLS credential or messaging device. Do not infer E2EE readiness, authorized account ownership or history access from domain registration.

## Smallest safe next gate

1. Repeat `roadmap.gwap` finalized owner and complete transfer-history reconstruction on an **independent archival RPC** and corroborate the creation signature and owner. Fail closed if any history is missing.
2. Verify **the user's intended controlling wallet** with an explicit domain-separated challenge and bind the authenticated GwapOS account, MLS KeyPackage signing identity and device transport key; do not ask for private keys or seed phrases.
3. Test owner A→B→A and RPC mismatch against the existing isolated PostgreSQL durable ownership generation/device-revocation directory.
4. In a separate reviewed PR, migrate old `6cDC…` GNS program references on the current GwapSpot app to canonical `A9SCN6…`. This isolated test branch does not touch live app code.

**Release gate unchanged:** No merge, production database deployment, Telegram deployment, Solana transaction, mainnet action or public E2EE claim.