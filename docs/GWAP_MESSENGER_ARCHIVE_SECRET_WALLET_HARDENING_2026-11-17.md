# GWAP Messenger — protected archive RPC gate and wallet-enrollment security hardening

**Date:** November 17, 2026 ET; GitHub Actions logs November 18 UTC
**Branch:** `test/gwap-messenger-archive-wallet-hardening-20261117`
**Canonical issue:** https://github.com/gwapupward-hub/gwapspot-web/issues/341
**Verified workflow:** https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44239930911

## Exact results

| Gate | Result |
| --- | --- |
| Strict independent finalized GNS V2 proof comparator | **17/17 tests PASS** |
| Synthetic authenticated GwapOS session + Solana wallet `signMessage` + disposable PostgreSQL MLS device enrollment | **14/14 tests PASS** |
| **Total test assertions** | **31/31 PASS, 0 fail** |
| Real read-only independent archive RPC on `roadmap.gwap` | **BLOCKED**: protected archive endpoint secret not configured |
| Entire GitHub Actions workflow | **RED BY DESIGN** because independent archive job exits 2 |

## Implementation

- `roadmap-archive-comparison.mjs` rejects missing or incomplete finalized proofs, wrong program, wrong network, wrong domain/PDA, stale or absent ownership-version evidence, and any mismatch in owner, creation signature, transfer count or history-entry count. It tolerates differing finalized slots when all ownership facts agree. `archiveCompletenessProven` remains **false** even after matching provider responses because GNS V2 has no onchain transfer counter.
- `roadmap-independent-archive-audit.mjs` accepts only an **HTTPS** secondary RPC endpoint from `GNS_ARCHIVE_READONLY_DEVNET_RPC`. It does not print the secret URL/host/path, token, RPC error text, or query parameters. It does not accept the same origin as `api.devnet.solana.com`; it reads only chain data; it exits nonzero unless the full proof comparison passes.
- `gwapos-wallet-mls-enrollment.mjs` now additionally demands `network=devnet`, A9SCN6 GNS V2, finalized history, **independentRpcCorroboration=true**, version, slot and transfer count before issuing or completing a wallet-signature enrollment challenge. The in-memory challenge map is capped at 128 outstanding entries; **it remains a test-only memory fixture, not a production-reliable challenge store**.
- The 14 enrollment tests cover signature validity, session substitution, exact MLS KeyPackage and device hash, replay, changed owner, A→B→A, archive outage, wrong network, single source and archive-proof disappearance before enrollment completion.

## Configure the archival job without sharing credentials in chat

1. Provision a **Solana DEVNET** HTTPS RPC endpoint from an archive-capable provider such as QuickNode or Helius that actually supports finalized `getSignaturesForAddress` and `getTransaction` for the GNS V2 name PDA `EmzaYXdX33QkUCVU8xqcRqot5KD4q3baQuxaiFgRBFqo`. A product plan advertising archival data does not prove this devnet history is available; use the script to check.
2. In GitHub repository `gwapupward-hub/gwapspot-web` open **Settings → Environments**. Create/configure `gwap-messenger-archive-readonly`, require a reviewer where available and restrict deployments to the approved test branch. Under that **environment's Secrets** add `GNS_ARCHIVE_READONLY_DEVNET_RPC` containing the full provider URL, including its token or query parameter if required. **Do not commit the endpoint, paste the token in chat or put it into a public GitHub issue.**
3. The workflow `.github/workflows/gwap-messenger-archive-wallet-hardening.yml` references the protected secret in `env`, not in an inline shell command. An absent secret is reported as `ARCHIVE_ENDPOINT_SECRET_NOT_CONFIGURED`, with nonzero status. The workflow runs when changes are pushed to the isolated branch; re-trigger with a reviewed branch push or a supported workflow run once the secret is configured. Note that GitHub's UI may not expose `workflow_dispatch` until a workflow exists on the default branch.
4. Require the resulting job to show `MATCHING_FINALIZED_RPC_RESPONSES`; corroborate owner wallet `58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV`, creation signature `4Ru9DcAj5xvFLD3yrsQbpREuLRjqXHzMF6hin2tEnwQvBhi26PzRha4FWZJiFfsFdjy4z46oCsndDR5AH9n62GiF`, ownership version `22a071adfb4b256e105401c219879199372d4a8b5e902fd28a1c80ccb5ce77b3`, one archived registration and zero observed transfers. Any mismatch, RPC error or unavailable history is a **BLOCKER**.

## Security caveats still blocking release

- A passing pair of RPCs is **corroboration**, not a cryptographic mathematical proof that neither has pruned events. GNS V2 NameRecordV2 has no onchain transfer counter. A robust production authority may require program-level monotonic revision or independently authenticated event indexing.
- No live GwapOS session, real Phantom/Privy wallet message signing, verification of actual OpenMLS credential signature/identity key or production device enrollment was performed. Test identities and SQL database were ephemeral.
- The current production GwapSpot GNS integration has older retired `6cDC` references; a separate owner-approved migration/PR remains necessary.
- Persistent encrypted OpenMLS StorageProvider, device backup/rollback/secret deletion, canonical persistent ordered delivery, iPhone Safari test and independent security audit remain open.

## Release boundary

Isolated GitHub branch, test-only files, 31 passing contract tests. No main-branch merge, no Vercel preview, no production database, no Solana transaction, no wallet signing, no public E2EE claim. **Release blocked pending verified independent archival evidence and actual user-session/device validation.**
## November 18 follow-up verification

The strict test suites were independently rerun and **passed again without changing the security contract**:

- [Archive comparator run #44241660998](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44241660998): **17/17 passed**. These use synthetic finalized-proof objects and are not independent live archival confirmation.
- [Wallet enrollment run #44241659720](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44241659720): **14/14 passed** against disposable PostgreSQL 16. No actual user's wallet signed.
- Three redundant test/manual workflow copies created during this follow-up were deleted. **The pre-existing canonical workflow** `.github/workflows/gwap-messenger-archive-wallet-hardening.yml` remains the single trusted integration gate, with its protected `gwap-messenger-archive-readonly` environment reference. The protected environment and secret still require owner-controlled configuration; their existence was not independently established here.

**No change to release decision:** the live independent-archive check remains blocked, and no production identity or MLS device authorization is permitted.


## November 18 — Owner-configured archive RPC recheck: PASSED

**This newest result supersedes the earlier missing-secret/blocker status in this report.**

- User confirmed that the protected archive RPC was configured. The failed job in the existing workflow was rerun with GitHub Actions run [#44239930911, attempt 2](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44239930911), **completed successfully** on November 18, 2026 at approximately 05:46 UTC.
- The secret-backed, independent secondary finalized devnet RPC returned `FINALIZED_HISTORY_READ_SUCCESS` and agreed with the primary on name, canonical GNS V2 program, derived PDA, owner, registration signature, ownership-version hash, transfer-event count and history count.
- Name: `roadmap.gwap`. PDA: `EmzaYXdX33QkUCVU8xqcRqot5KD4q3baQuxaiFgRBFqo`. Public on-chain owner: `58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV`.
- Registration: `4Ru9DcAj5xvFLD3yrsQbpREuLRjqXHzMF6hin2tEnwQvBhi26PzRha4FWZJiFfsFdjy4z46oCsndDR5AH9n62GiF`. Derived ownership version: `22a071adfb4b256e105401c219879199372d4a8b5e902fd28a1c80ccb5ce77b3`.
- Both providers returned **1 registration history entry and 0 observed transfers**; primary finalized slot **523529264**, secondary finalized slot **523529267**.
- Exact verdict: `comparison = MATCHING_FINALIZED_RPC_RESPONSES`, `independentRpcCorroboration = true`, `archiveCompletenessProven = false`, and `canAuthorizeMessaging = false`.
- The synthetic wallet/GNS/OpenMLS enrollment test job retained its earlier passing status: **17/17 archive-comparison fixture assertions + 14/14 wallet-device enrollment fixture assertions**. No live GwapOS session, actual owner-wallet signature, enrolled device, or transaction was involved.
- The secondary RPC URL/API credentials remain secret in the protected workflow. The visible job log masked the endpoint; no secret was copied into this report or chat.

**Security interpretation:** The independent RPC corroboration gate is now **PASS**, subject to the limitations of two RPC providers and a GNS V2 program without a native monotonic transfer counter. This does **not** prove absolute archival completeness or authorize production messaging. **Next engineering gate**: implement an independently reviewable GwapOS session-bound, consented wallet `signMessage` pilot and bind a *validated* OpenMLS credential/signing identity to the correct immutable GWAP account/device. Persistent reviewed MLS storage, canonical delivery, iPhone Safari and security review remain open.

**Release state unchanged: NO MERGE, NO DEPLOY, NO REAL DEVICE ENROLLMENT.**
