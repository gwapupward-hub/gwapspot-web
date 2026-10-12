# Assessment remediation — October 12, 2026

## Current checkpoint

**Active task:** P0 / assessment C07 — close the GNS registration network boundary.
**Status:** release candidate; implementation, local regression checks and the
production build are complete. Remote checks, preview and signed-wallet release
acceptance remain pending. No second remediation task has been started.
**Repository:** `gwapupward-hub/gwapspot-web`.
**Branch:** `fix/assessment-gns-devnet-2026-10-12`.
**Baseline:** `2c75c137216adce3feabf0019237c70bfcf06734`.

The input assessment is dated October 12, 2026, scored 3.16/5 with medium
confidence, and explicitly leaves C07's production network unsettled. This
remediation does not rewrite the assessment or invent a higher score.

## P0 finding and implemented boundary

Production GwapOS selects mainnet for its ordinary wallet experience. GNS
already selects its own transaction network; the OS runtime flag alone is not
evidence that GNS transactions settled on mainnet. The actual weaknesses were:

- server configuration could accept another network through `GNS_EXPECTED_NETWORK`;
- the browser could accept mainnet/testnet registration configurations;
- the GNS RPC override was never verified against a genesis hash;
- direct receipt submission did not revalidate deployment configuration;
- receipt recovery could accept a name lookup after configuration validation failed.

GNS registration is now pinned to **Solana devnet** on every host. Non-devnet
configuration stops registration, independently of the mainnet OS wallet.

| Boundary | Implemented behavior |
| --- | --- |
| Server deployment | Expected network must be devnet. Backend network, program, treasury, on-chain mode and a positive, bounded integer fee must validate. |
| Browser configuration and builder | Reject mainnet, testnet and malformed registration configurations. |
| RPC before signing | Check `getGenesisHash()` against `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` before building or requesting wallet approval. Failure does not fall back to another network. |
| Wallet sender | Select only `solana:devnet` for GNS registration. |
| Direct receipt submission | Revalidate backend config before forwarding a receipt. Configuration failure returns 503 without an ownership-recovery lookup. |
| Background receipt recovery | Preserve pending devnet receipts when validation is unavailable; do not activate an identity around the guard. Historical cross-cluster receipts remain inspectable and are reported failed rather than active. |
| User message | State that GNS registration uses devnet and test SOL; show a network-verification state before wallet signing. |
| Public health evidence | Report allowed network, mainnet write policy and expected-network consistency without disclosing credentials or calling the GNS backend. |

No feature switch, program deployment, mainnet custody gate or paid service was
enabled. No signing key or production credential was copied locally.

## Verification evidence

- 26 targeted tests pass across registration building, RPC genesis validation,
  service/HTTP receipt handling, recovery, identity continuity and OS runtime.
- Full `npm test`: **531 passed, 0 failed**. TypeScript passes. Repository lint
  passes with zero errors and 18 existing warnings; changed-source lint is clean.
- Full `npm run build` passes, including Next.js compilation, TypeScript and
  static generation. No production credentials were required for that build.
- Tests use the real GNS service, HTTP handler and reconciler with local network,
  authentication and persistence fixtures. They do not submit a live transaction.
- The negative-fee fixture exposed an existing server validation gap; fees now
  must be positive as well as bounded integers.
- Before this change, Vercel's production app health endpoint returned HTTP 200,
  authenticated storage ready, and baseline commit `2c75c137…`.
- Vercel production metadata identifies `gwapupward-hub/gwapspot-web`, branch
  `main`, and the same baseline commit. The absence of a YAML deployment job
  does not by itself mean native Git-to-Vercel integration is missing.

Build/preview/CI results and the exact published commit must be entered here
before declaring release verification complete.

## Remaining release gates for P0

1. Confirm required GitHub checks for the exact patch; local build is complete.
2. Verify the app preview is READY, `/api/health` exposes the expected GNS
   policy, and unauthenticated GNS config/receipt requests still return 401.
3. In an authenticated Phantom/Privy session, check name availability, confirm
   the network/test-SOL disclosure, and complete a devnet registration with a
   `cluster=devnet` receipt. Exercise cancelled signing and retry sync without
   submitting a duplicate transaction.
4. Release through the existing protected Git/Vercel path; verify the deployed
   commit, production health and GNS policy. Record the result here.

Production `GNS_EXPECTED_NETWORK` exists in Vercel for the app project but is
stored as a non-readable sensitive value. Its value has not been retrieved.
The new health check can report whether that value matches the enforced policy.
Direct access to the default GNS backend `/api/config` timed out in this
environment. Backend reachability and a signed-wallet smoke test therefore
remain unproven until those release gates are exercised.

## Next sprint pickup

**Resume P0 first if any release gate above is still open.** Start by inspecting
the branch/PR head and CI/deployment status, rather than rebuilding the patch.
Run only the missing or newly affected checks. Keep all submitted receipts;
retry registry sync instead of asking the wallet to pay again.

Once P0 closes, the next independent task is **P1 / C01: enforce CSP**.
Inspect `next.config.ts` and `/api/csp-report`, inventory actual Privy, wallet,
RPC, analytics, Telegram, frame and websocket requirements, and validate the
policy on a preview before switching from report-only to enforced CSP.
Acceptance must include public pages, wallet/email sign-in, wallet transaction
prompts, and Telegram embedding where supported. Do not flip the header without
those checks.

| Order | Assessment item | Pickup and completion gate | Status |
| --- | --- | --- | --- |
| 1 | C07 GNS network | Finish the P0 release gates above. | Active |
| 2 | C01 CSP enforcement | Preview-test permitted origins and authenticated flows; then verify the enforced header in production. | Not started |
| 3 | C03 delivery and review gates | Inspect native Vercel Git settings, deployment records, protected `main` and required checks. Add a deployment workflow only if the existing path needs one. Preserve unknown DORA values until real deployment/incident records support them. | Not started |
| 4 | Mobile LCP | Inspect the actual LCP element and critical request path, make one measured fix, then compare repeatable runs under the same conditions. Preserve field-data unknowns. | Not started |
| 5 | C09 GwapScore determinism | Verify the canonical frozen architecture/model and repeatability in `GwapScore-Official-v1`; this site is a consumer, not the scoring engine. Require versioned inputs, timestamp/window handling and stable results. | Not started |
| 6 | Maintenance/security evidence | CONTRIBUTING/runbook coverage, reviewer ownership, human-only author concentration, scanning alert state, uptime and TLS evidence. Avoid treating unavailable measurements as zero. | Not started |

## Rollback

Revert the patch through the normal reviewed release path if needed. Reverting
reopens the network-validation weaknesses, so pause GNS registration until an
equally safe guard exists. Never change a devnet guard or an environment value
to enable mainnet as a recovery shortcut. This patch does not delete on-chain
names or transaction history.
