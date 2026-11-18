# GWAP Messenger — roadmap.gwap second-RPC security gate and wallet-signature enrollment

**Date:** November 17, 2026 (America/New_York), GitHub CI logs November 18 UTC.
**Branch:** `test/gwap-messenger-roadmap-live-gns-v2-20261117` (isolated, no merge/deploy).
**Previous real finalized single-RPC name verification:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44235749879
**This sprint CI run 1:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44237944506
**This sprint CI run 2:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44238068823

## Verified status

| Security gate | Status | Evidence |
| --- | --- | --- |
| `roadmap.gwap` correct A9SCN6 V2 account, owner and one registration on public devnet RPC | **Previously verified** | Same owner and history reconstructed in both new runs on `api.devnet.solana.com` |
| Independent complete finalized history via dRPC | **BLOCKED** | `solana-devnet.drpc.org` rejected Solana devnet: chain unavailable on free plan (400 / code 35) |
| Independent complete finalized history via Tatum | **BLOCKED** | `solana-devnet.gateway.tatum.io` denied anonymous `getSignaturesForAddress`; registration required |
| Independent archival corroboration | **NOT VERIFIED** | Neither second provider returned a complete name transfer history |
| Test-only GwapOS wallet-signature + GNS V2 device challenge | **11/11 PASS** | Both CI runs have PostgreSQL integration job SUCCESS |
| Real authenticated GwapOS session + actual owner's wallet signature | **NOT VERIFIED** | Test uses generated Ed25519 keys and injected session verifier |
| Production device authorization | **NOT AUTHORIZED** | No wallet/device enrolled, no live backend, no deployment |

## Public chain evidence unchanged

- Canonical program: `A9SCN6tgaoAEorFzY5ZPinruk8LCttmrAEU9JoAmUKUH`.
- Name: `roadmap.gwap`; canonical PDA: `EmzaYXdX33QkUCVU8xqcRqot5KD4q3baQuxaiFgRBFqo`.
- Public record owner wallet: `58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV` (not yet authenticated via live wallet signature).
- The public RPC currently returns 1 creation signature, 0 observed transfers; ownership version on that RPC: `22a071adfb4b256e105401c219879199372d4a8b5e902fd28a1c80ccb5ce77b3`.
- The presence of a valid name record is not equivalent to proof of current user control, historical completeness or right to inspect previous owners' encrypted inbox.

## Test-only wallet-signature contract implemented

`openmls-poc/gns-binding/gwapos-wallet-mls-enrollment.mjs` and `.test.mjs`:

1. Server-owned, injected authenticated GwapOS session resolves a stable `gwap_...` account, private session subject and verified Solana wallet. Caller-supplied account/wallet changes are rejected.
2. Server-only finalized GNS V2 reader must return complete finalized ownership evidence and the owner wallet must equal the authenticated session wallet. No owner-only `/resolve` fallback.
3. Creates one-time 120-second server challenge in the disposable PostgreSQL device registry. The proposed device id, exact transport Ed25519 public key and exact SHA-256 of serialized MLS KeyPackage are bound to the server challenge.
4. A real wallet-adapter implementation would invoke **`signMessage` only**, with explicit user approval. The test uses a generated keypair; it does NOT access the user's wallet. No transaction or token movement.
5. Completion re-verifies the session subject/account/wallet, nonce, deadline, finalized name owner and ownership version. It verifies all signed challenge fields and exact KeyPackage hash, then delegates Ed25519 verification, single-use nonce and durable device enrollment to the isolated PostgreSQL directory. A→B→A changes invalidate old challenges.
6. Eleven passing tests include: valid enrollment, nonexistent/wrong-wallet session, forged wallet signature, swapped authenticated session, substituted transport key, changed MLS bytes, direct transfer and A→B→A, RPC outage/incomplete archive, declined wallet signing and replayed/mutated account/nonce.

## Remaining production work

- **Independent archive provider with historical devnet RPC**: provision an archive-grade HTTPS Solana devnet RPC URL in an access-controlled GitHub Actions environment/secret. Do **not** post API keys or private RPC tokens in a public GitHub workflow or chat. Run the existing verifier with `GNS_ARCHIVE_READONLY_DEVNET_RPC` and compare genesis, canonical program, PDA, owner, creation signature, event history, version and transfer count. Even two matching providers cannot mathematically prove absence of missing events without an onchain transfer counter; an authenticated finalized onchain counter would improve the trust model.
- **Live wallet user action**: route an explicit wallet `signMessage` prompt through GwapOS's existing verified-wallet session and enforce the same verified wallet/account on both challenge and completion; do not ask user to share a private key or seed phrase.
- **Actual MLS credentials**: verify the OpenMLS signature and bind the MLS key to the signed device registration rather than relying on SHA-256 bytes alone; require that the credential represents the exact canonical account/device and membership epoch.
- **Production storage and service**: ensure secure durable key storage, challenge/nonce persistence and rate limiting, trusted origin, TLS, consent/block policy, approved state migration, device revocation after real transfer, database roles and independent security review.
- **Runtime remains untouched**: all current files are isolated in `openmls-poc/gns-binding/` and a test-only GitHub workflow. The current GwapSpot runtime still requires separately approved canonical GNS program migration from retired `6cDC` to `A9SCN6`.

## Release state

**BLOCKED.** Archive corroboration incomplete and user wallet-control signing not performed. Do not enroll any real messaging device, merge to main, create a deployment, expose end-user E2EE, connect production Neon or submit Solana transactions.