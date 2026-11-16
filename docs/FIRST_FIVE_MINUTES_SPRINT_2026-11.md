# GWAP First-Five-Minutes Sprint · November 9–15, 2026

Status: **Sprint 1 follow-up implemented on a local feature branch; PR and deployment pending authorization.**

The initial public first-value experience was merged in PR #331 (baseline commit
`3743a689`). This follow-up closes remaining continuity and measurement gaps; it
does not expand GNS registration, GwapScore scoring, or PPV custody scope.

## North star

A new visitor should understand GWAP's promise, search an identity without a wallet or account, receive an honest public result, and know the next useful action in five minutes or less.

**Product promise:** Make claims easier to verify by connecting identity, reputation, and documented proof. GWAP does not guarantee that a person or project is honest, safe, audited, or financially sound.

## One user-facing journey

1. Public homepage: explain the benefit in ordinary language.
2. Choose a goal: build, validate, establish identity, strengthen reputation, or document proof.
3. Public lookup: check a Solana wallet or `.gwap` name without sign-in.
4. Identity & reputation result: present source status, absent/unavailable information, and limitations.
5. Next step: view a public profile or choose to sign in to claim an identity or continue in GWAP OS.

### System ownership and boundaries

| System | Owns | Cannot imply |
| --- | --- | --- |
| Tha GwapSpot | Public entry, discovery, consent, next action | All products are already released |
| GNS | `.gwap` name, resolution, ownership, public profile | Registration is mainnet-enabled |
| GwapScore | Interpret eligible, attributable reputation evidence | Missing social proof is misconduct; wealth is reputation |
| PPV | Canonical proofs, receipts, events, source records | Proof equals audit, honesty guarantee, or custody authorization |
| GwapOS | Authenticated workspace, cross-product handoff, evidence display | It independently verified sources not actually checked |

## November 10 live audit evidence

Desktop browser: homepage `https://www.gwapspot.com/` and the route reached by its identity card. Four screenshots recorded in `gwap_first_value_audit` outside the repository.

- **Step 1 / first visit — friction:** a mandatory entry splash required the visitor to tap Enter. A timed Lil Gwapz overlay appeared after entry.
- **Step 2 / homepage — good:** plain-language mission and goal CTA were visible; public identity lookup was not in the active homepage tree.
- **Step 3 / goal selection — good with ambiguity:** five goal paths were visible, but the identity card sent the visitor into `/app/identity` rather than a public discovery step.
- **Step 4 / handoff — blocked for anonymous visitors:** the identity card redirected to `https://app.gwapspot.com/os-sign-in?redirect_url=%2Fapp`; email and wallet sign-in options were presented before any identity lookup.

Not tested in this audit: mobile breakpoints, authenticated OS journey, successful live GNS resolution, production API availability, first-value completion rate, accessibility via assistive technology, or PPV receipt round trip.

## Sprint 1 change set

- **Already in the November 10 baseline (PR #331):** mount `HomeUtility` on the
  homepage, link hero and identity goal to wallet-free discovery, explain source
  limitations, and skip the compulsory homepage splash/promo. Keep the existing
  `/api/public/lookup` validation and rate-limit boundary.
- **Follow-up in this feature branch:** retain the identity goal through the
  in-page public lookup, and retain identity intent plus the validated `.gwap`
  suggestion through the `/app/identity?name=…` claim/sign-in handoff.
- **Follow-up in this feature branch:** measure results with typed, privacy-safe
  lookup events rather than inferring success from changing DOM text. All-source
  outages, invalid inputs, and request failures must **not** count as first
  value. Maintain coarse timing (`under_30s`, `30s_to_2m`, `2m_to_5m`, `5m_plus`)
  without emitting wallet addresses or searched names to analytics.
- **Follow-up in this feature branch:** give truthful source-unavailable copy,
  disclose test SOL/devnet for name registration, and require a fresh registry
  check and explicit signing before registering a suggested name.

### Sprint 1 acceptance

1. Unauthenticated visitor can reach wallet/name lookup from the hero or identity goal without sign-in.
2. Empty/invalid input is rejected clearly; temporary upstream errors remain distinct from missing identity/evidence.
3. Public lookup success shows a meaningful result and a correct next action; claim still requires authentication.
4. No compulsory intro/promo popup blocks the homepage.
5. Frontend passes focused tests, TypeScript, lint, full suite and a production build.
6. Check desktop and mobile in a deployment preview before merging. Do not treat a local build as production confirmation.

### Follow-up verification, November 10

| Check | Result | Limitation |
| --- | --- | --- |
| Public lookup, intent continuity, first-value event tests | Pass | Unit/source-level integration checks, not a browser E2E test |
| Full repository tests | Pass: 627 tests, 0 failures | Local runtime and test fixtures |
| TypeScript, ESLint, Next.js production build | Pass | Lint reports existing warnings but no errors |
| Local HTTP smoke | `/` 200, malformed public name 400, `/app/identity?name=…` 200 | Does not prove real authenticated sign-in or registry availability |
| Production or preview, mobile, actual signed-in claim | Not verified | Requires separately authorized preview/release validation |

**Release guard:** Do not push the feature branch until preview behavior is
approved. Vercel automatically generates previews from GitHub branch pushes
in the current repository integration, so a remote draft PR may initiate a
deployment even if it is never merged.

## Thursday: Identity → reputation attribution

**Prove one successful OS journey**, starting from an owned `.gwap` identity or authorized devnet test wallet. Capture the GNS resolved name, authenticated wallet control, evidence source, GwapScore state, coverage/confidence and the OS result. Negative cases: missing identity, invalid signature, unavailable evidence. Never turn missing evidence into a zero score. Preserve separate production wallet runtime and devnet GNS registration boundaries.

## Friday: PPV → OS activity

**Prove one authorized devnet receipt** with the canonical PPV proof ID, event ID, receipt ID, source environment, verification result and linked GNS subject. Present provenance and limits on the OS activity screen. No escrow/mainnet custody authorization, minting, or settlement change is included in this sprint.

## Measurement and release gate

Primary metric: percent of new visitor sessions with a meaningful public result within five minutes. Track funnel stages `hero_conversion_click` → `intent_path_selected` (when applicable) → `lookup_started` → `lookup_completed` → `first_value_reached` → optional `lookup_activation_click` / OS handoff. Analyze only aggregate metadata and coarse timing; never send raw wallet addresses, names, verification codes, or private receipts to conversion analytics.

Ship only after the preview confirms an unauthenticated desktop/mobile path, backend responses and error states, and no critical accessibility/navigation regressions. Use a PR and ordinary review/CI; do not deploy or merge solely from this document.

## Below the line

New naming features, extra score dimensions, Marketplace expansion, collectible receipts, cosmetic OS redesign and PPV mainnet custody. Revisit them only when the onboarding/integration acceptance test is demonstrated.
