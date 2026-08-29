---
name: gwapos-wallet-native-app
description: >
  Production execution skill for completing, debugging, hardening, testing,
  and releasing app.gwapspot.com as the dedicated wallet-native GwapOS client.
  Use for app.gwapspot.com, Phantom, Jupiter Wallet, Solana wallet-host detection,
  Privy/SIWS authentication, wallet session lifecycle, app-domain isolation,
  GwapOS wallet UI/UX, wallet WebView performance, splash reliability, RPC
  discipline, and public-site regression protection.
---

# GwapOS Wallet-Native Application Phase Execution Checklist

## Release Rule

Execute phases in order.

Do not begin a lower-priority phase while an unresolved dependency, P0 risk, or release stop condition remains open.

A phase is complete only when:

- its entry criteria are satisfied;
- its deliverables are implemented;
- its exit criteria are verified;
- required evidence is recorded;
- no phase-specific stop condition remains.

---

## Phase 0 — Reconnaissance and Baseline

**Owner:** Tech Lead  
**Support:** Wallet Integration Engineer, Auth/Security Engineer  
**Dependencies:** None

### Objective

Understand the current architecture, preserve existing wallet fixes, and establish a measurable baseline before changing code.

### Checklist

- [ ] Confirm clean or intentionally documented working tree.
- [ ] Confirm current branch and recent commits.
- [ ] Review recent app-domain, Phantom, Jupiter, Privy, SIWS, and session changes.
- [ ] Inspect app-domain routing and middleware/proxy behavior.
- [ ] Map responsibilities for Privy, Wallet Standard, Wallet Adapter, and custom auth.
- [ ] Map public-site and app-domain routes.
- [ ] Audit splash playback and fallback behavior.
- [ ] Record known failures and open risks.
- [ ] Create or confirm focused working branch.
- [ ] Document scope boundaries and owners.
- [ ] Run baseline repository validation commands where available.

### Entry Criteria

- Repository is accessible.
- Current branch and working-tree state are known.
- No unrelated work will be overwritten.
- Required owners are assigned.

### Exit Criteria

- Authentication ownership is documented.
- App/public routing boundaries are documented.
- Existing Phantom/Jupiter fixes are identified and preserved.
- Baseline lint, typecheck, test, and build results are recorded.
- Known failures are prioritized.
- Scope and dependencies are approved by the Tech Lead.

### Stop Conditions

Stop if:

- authentication ownership is unclear;
- routing boundaries are unclear;
- recent wallet fixes cannot be identified;
- baseline failures are undocumented;
- unrelated work may be overwritten.

---

## Phase 1 — App-Domain and Client Isolation

**Owner:** Frontend Engineer  
**Support:** Tech Lead, QA Engineer  
**Dependencies:** Phase 0 complete

### Objective

Enforce the separation between the public website and the wallet-native GwapOS client.

### Checklist

- [ ] Validate the exact `app.gwapspot.com` hostname.
- [ ] Reject lookalike and unsafe suffix-matching domains.
- [ ] Define and enforce the approved GwapOS route allowlist.
- [ ] Prevent marketing routes from leaking into the app domain.
- [ ] Add ordinary-browser wallet-host-required gateway.
- [ ] Keep the full GwapOS client unavailable outside supported wallet hosts.
- [ ] Remove email-wallet onboarding from app-domain flows.
- [ ] Preserve public-site onboarding and sign-in behavior.
- [ ] Add routing and client-isolation tests.

### Entry Criteria

- Phase 0 routing map is complete.
- Exact hostname requirements are approved.
- Approved GwapOS route groups are identified.
- Public-site behavior has a recorded baseline.

### Exit Criteria

- `app.gwapspot.com` accepts only approved app routes.
- `gwapspot.com` and `www.gwapspot.com` retain public behavior.
- Lookalike and suffix-matching domains are rejected.
- Ordinary Safari/Chrome users receive the wallet-host gateway.
- Ordinary browsers do not receive the full GwapOS client.
- Marketing routes do not render through the app domain.
- App routes do not expose email-wallet onboarding.
- Isolation tests pass.

### Stop Conditions

Stop if:

- hostname validation is unsafe;
- the full app renders outside wallet hosts;
- public routes leak into the app domain;
- email-wallet onboarding remains in the app client;
- public-site behavior changes unexpectedly.

---

## Phase 2 — Wallet-Host Detection

**Owner:** Wallet Integration Engineer  
**Support:** Frontend Engineer, QA Engineer  
**Dependencies:** Phase 1 complete

### Objective

Reliably distinguish supported wallet browsers from ordinary browsers and model provider initialization explicitly.

### Checklist

- [ ] Implement capability-based detection.
- [ ] Prefer Wallet Standard/provider capabilities over user-agent strings.
- [ ] Detect `signMessage` support.
- [ ] Handle delayed provider injection.
- [ ] Distinguish missing, delayed, unsupported, and ready states.
- [ ] Recognize Phantom and Jupiter without unnecessary generic wallet selection.
- [ ] Prevent duplicate connection attempts.
- [ ] Add provider lifecycle handling for reload and background/foreground transitions.
- [ ] Add detection tests.

### Entry Criteria

- App-domain isolation is passing.
- Supported wallet hosts and required capabilities are documented.
- Authentication owner is known from Phase 0.

### Exit Criteria

- Ordinary browsers are classified as unsupported wallet environments.
- Phantom and Jupiter are recognized through provider capabilities.
- Delayed initialization produces a recoverable loading state.
- Missing or unsupported providers produce actionable states.
- Detection does not depend solely on UA strings.
- Detection does not trigger duplicate connection attempts.
- Detection tests pass.

### Stop Conditions

Stop if:

- detection relies solely on UA strings;
- ordinary browsers are treated as wallet hosts;
- unsupported providers are treated as ready;
- initialization can wait indefinitely;
- duplicate connection attempts occur.

---

## Phase 3 — Authentication and Session State Machine

**Owner:** Auth/Security Engineer  
**Support:** Wallet Integration Engineer, Tech Lead, QA Engineer  
**Dependencies:** Phase 2 complete

### Objective

Create one secure, deterministic wallet authentication and session lifecycle.

### Checklist

- [ ] Confirm one owner for wallet connection, SIWS, authentication, and session creation.
- [ ] Remove or disable competing auto-connect/authentication flows.
- [ ] Separate wallet connection from wallet authentication.
- [ ] Define explicit connection, authentication, and session states.
- [ ] Require a valid session/access token before opening `/app`.
- [ ] Preserve valid returning sessions for the same wallet.
- [ ] Reauthenticate after wallet changes or session expiry.
- [ ] Handle rejected signatures without loops or blank screens.
- [ ] Verify fresh, audience-bound, non-replayable SIWS challenges.
- [ ] Validate redirect parameters.
- [ ] Audit logs and telemetry for sensitive data.
- [ ] Add authentication and session regression tests.

### Required State Sequence

```text
SPLASH
→ READY_TO_ENTER
→ DETECTING_WALLET
→ AUTHORIZING_WALLET
→ WAITING_FOR_SIGNATURE
→ ESTABLISHING_SESSION
→ OPENING_GWAP_OS
→ READY
```

### Entry Criteria

- Wallet-host detection is passing.
- Provider capabilities are known.
- Existing Privy/SIWS implementation has been audited.
- App and public authentication responsibilities are documented.

### Exit Criteria

- One authentication owner is enforced.
- `/app` cannot open before session/access-token readiness.
- Valid returning sessions avoid unnecessary signatures.
- Wallet changes invalidate or reauthenticate the session.
- Rejected signatures recover cleanly.
- No `/app` ↔ `/os-sign-in` redirect loop exists.
- SIWS is verified, fresh, audience-bound, and non-replayable.
- No private keys, seed phrases, signatures, tokens, or secrets are logged or exposed.
- Public sign-in remains unchanged.
- Authentication tests pass.

### Stop Conditions

Stop if:

- authentication ownership is duplicated;
- address-only authentication exists;
- SIWS verification is weakened;
- navigation bypasses session readiness;
- wallet changes are ignored;
- redirect loops remain;
- sensitive data is exposed.

---

## Phase 4 — Splash Reliability

**Owner:** Frontend Engineer  
**Support:** Wallet Integration Engineer, QA Engineer, Performance Engineer  
**Dependencies:** Phase 3 state machine defined

### Objective

Ensure the dedicated app splash always reaches an interactive entry state.

### Checklist

- [ ] Preserve the app-specific splash.
- [ ] Hold the final frame after normal playback.
- [ ] Keep `Enter Tha GwapSpot` available until user continuation.
- [ ] Handle autoplay rejection.
- [ ] Handle media errors.
- [ ] Handle stalled playback and missing progress.
- [ ] Handle missing `ended` events.
- [ ] Add absolute fallback timeout.
- [ ] Support reduced-motion behavior.
- [ ] Recover from wallet WebView background/foreground transitions.
- [ ] Ensure splash failure cannot block wallet detection or session restoration.
- [ ] Add splash failure-path tests.

### Entry Criteria

- Authentication state machine is defined.
- App splash implementation is isolated from the public-site splash.
- Entry and fallback states are identified.

### Exit Criteria

- Normal playback reaches and holds the final frame.
- `Enter Tha GwapSpot` remains available.
- Autoplay rejection reaches an interactive state.
- Media errors reach an interactive state.
- Stalled playback reaches an interactive state.
- Missing progress or `ended` events cannot deadlock entry.
- Reduced-motion users can continue.
- Lifecycle interruptions recover safely.
- Public-site splash remains unchanged.
- Splash tests pass.

### Stop Conditions

Stop if:

- the splash can deadlock;
- Enter becomes unavailable;
- reduced-motion users cannot proceed;
- lifecycle recovery fails;
- the public splash changes.

---

## Phase 5 — Wallet-Native GwapOS Shell and Wallet View

**Owner:** Frontend Engineer  
**Support:** Product/Design Owner, Wallet Integration Engineer, QA Engineer  
**Dependencies:** Phases 1–4 complete

### Objective

Build the app-specific mobile-first GwapOS cockpit and wallet identity surface.

### Checklist

- [ ] Remove public marketing navigation from the app client.
- [ ] Remove public footer, SEO content, and redundant marketing CTAs.
- [ ] Implement mobile-first GwapOS shell.
- [ ] Add wallet provider identity.
- [ ] Add shortened wallet address.
- [ ] Add copy-address action.
- [ ] Display authentication state.
- [ ] Display `.gwap` identity where available.
- [ ] Add avatar/profile fallback where available.
- [ ] Add network/session status where supported.
- [ ] Load wallet data progressively.
- [ ] Keep shell rendering independent of nonessential wallet analytics.
- [ ] Distinguish GwapOS sign-out from wallet disconnect.
- [ ] Exclude email-wallet onboarding and unrelated finance functionality.
- [ ] Verify public-site isolation.

### Entry Criteria

- App/public boundary passes.
- Wallet-host detection passes.
- Authentication/session flow passes.
- Splash reliably reaches entry.
- Product/design direction is approved.

### Exit Criteria

- App UI is visibly distinct from the public website.
- Wallet identity is visible and accurate.
- `.gwap` identity appears where available.
- Wallet data loads progressively.
- Shell does not wait on nonessential RPC or analytics.
- Sign-out and disconnect actions are distinct.
- No email-wallet CTA appears in the app.
- No unrelated swaps, bridges, trading, or custody features are introduced.
- Public website remains unchanged.

### Stop Conditions

Stop if:

- the app still resembles the public website;
- wallet identity is missing or inaccurate;
- wallet data blocks the shell;
- sign-out and disconnect are conflated;
- scope expands into unrelated product work.

---

## Phase 6 — Mobile WebView, Performance, and RPC Hardening

**Owner:** Performance Engineer  
**Support:** Frontend Engineer, Wallet Integration Engineer, QA Engineer  
**Dependencies:** Phase 5 shell and core flows complete

### Objective

Make the wallet client reliable and performant inside mobile wallet WebViews.

### Checklist

- [ ] Add safe-area inset support.
- [ ] Use dynamic viewport units where supported.
- [ ] Test keyboard open/close behavior.
- [ ] Test wallet browser top and bottom chrome.
- [ ] Verify Dynamic Island, notch, and home-indicator layouts.
- [ ] Verify Android navigation-bar behavior.
- [ ] Verify orientation and back navigation.
- [ ] Confirm critical touch targets are at least 44px where practical.
- [ ] Audit continuous animations for transform/opacity usage.
- [ ] Reduce excessive `backdrop-filter` usage.
- [ ] Remove unnecessary permanent `will-change`.
- [ ] Defer nonessential wallet data.
- [ ] Deduplicate balance, GNS, activity, and RPC requests.
- [ ] Add bounded retries and avoid retry storms.
- [ ] Define actionable loading and failure states.
- [ ] Profile Phantom, Jupiter, mobile Safari, and throttled conditions.
- [ ] Record performance evidence.

### Entry Criteria

- Core app shell and wallet view are functional.
- Authentication and splash flows pass.
- Critical wallet data requests are identified.
- Representative device/browser test environments are available.

### Exit Criteria

- Critical controls remain visible and reachable across tested safe-area states.
- Keyboard and wallet browser chrome do not obscure actions.
- Continuous animation uses compositor-friendly properties.
- Excessive blur and permanent `will-change` are removed.
- Shell renders before nonessential analytics.
- Duplicate RPC requests are removed or controlled.
- Retry behavior is bounded.
- Failure states provide recovery actions.
- Targets are met where measurable:
  - 60fps on representative flows;
  - CLS below 0.05;
  - TBT below 150ms where measurable.
- Performance evidence is recorded.

### Stop Conditions

Stop if:

- controls are obscured;
- keyboard layouts fail;
- animations visibly jank;
- RPC duplication remains on the critical path;
- analytics block the shell;
- failure states are blank or non-actionable.

---

## Phase 7 — Automated Regression Coverage

**Owner:** QA Engineer  
**Support:** Frontend Engineer, Wallet Integration Engineer, Auth/Security Engineer  
**Dependencies:** Phases 1–6 stable

### Objective

Prevent regressions in routing, wallet detection, authentication, splash recovery, client isolation, and public-site behavior.

### Checklist

- [ ] Add exact-hostname routing tests.
- [ ] Add lookalike and suffix-matching rejection tests.
- [ ] Add app-route allowlist tests.
- [ ] Add marketing-route rejection tests.
- [ ] Add ordinary-browser gateway tests.
- [ ] Add app/public UI-isolation tests.
- [ ] Add app email-onboarding exclusion tests.
- [ ] Add wallet-host detection tests.
- [ ] Add delayed-provider and unsupported-capability tests.
- [ ] Add splash playback and fallback tests.
- [ ] Add authentication readiness tests.
- [ ] Add access-token delay tests.
- [ ] Add rejected-signature tests.
- [ ] Add wallet-change tests.
- [ ] Add expired-session tests.
- [ ] Add duplicate-callback tests.
- [ ] Add redirect-loop prevention tests.
- [ ] Add provider-ownership regression tests.
- [ ] Add wallet-view loading and failure-state tests.
- [ ] Add public-site regression tests.
- [ ] Document coverage gaps.

### Entry Criteria

- Phases 1–6 have stable implementations.
- Test environments and mocks are available.
- Critical acceptance paths are documented.

### Exit Criteria

Tests fail when:

- ordinary browsers receive the full app;
- public routes leak into the app domain;
- email-wallet onboarding appears in the app;
- a second authentication owner is introduced;
- splash playback can deadlock;
- navigation occurs before session readiness;
- wallet changes retain the wrong identity;
- public-site behavior changes;
- critical failure states lack recovery.

All required automated tests pass.

### Stop Conditions

Stop if:

- critical paths lack test coverage;
- tests are disabled to hide failures;
- provider/auth ownership cannot be asserted;
- public-site regression coverage is absent.

---

## Phase 8 — Go/No-Go Release

**Owner:** Tech Lead  
**Support:** QA Engineer, Auth/Security Engineer, Wallet Integration Engineer, Product/Design Owner  
**Dependencies:** Phases 1–7 complete; preview available; validation passes

### Objective

Make the release decision using verified evidence rather than implementation status alone.

### Checklist

- [ ] Confirm all P0 risks are closed.
- [ ] Confirm release-critical P1 risks are closed.
- [ ] Confirm no unresolved security, routing, splash, session, or public-site stop condition remains.
- [ ] Run repository-defined validation commands.
- [ ] Verify Vercel preview.
- [ ] Verify production where authorized.
- [ ] Test Phantom in the real wallet browser.
- [ ] Test Jupiter in the real wallet browser.
- [ ] Test Solflare and Backpack where practical.
- [ ] Test ordinary iOS Safari.
- [ ] Test ordinary Chrome.
- [ ] Test desktop browser.
- [ ] Record screenshots, logs, traces, and test results.
- [ ] Update risk register.
- [ ] Prepare focused PR and release notes.
- [ ] Obtain explicit release approval.

### Entry Criteria

- All prior phase exit criteria pass.
- Preview deployment is available.
- Required test accounts and wallet hosts are available.
- Validation commands complete without unexplained failures.
- Risk register is current.

### Exit Criteria for GO

All of the following are true:

- App/public isolation passes.
- Ordinary browsers receive the wallet-host gateway.
- App routes do not expose marketing pages.
- App sign-in excludes email-wallet onboarding.
- One secure authentication owner exists.
- Session readiness gates navigation.
- SIWS is verified and non-replayable.
- Splash recovery is complete.
- Phantom passes real end-to-end testing.
- Jupiter passes real end-to-end testing.
- Rejected signatures recover correctly.
- Wallet changes are handled securely.
- Public-site regression checks pass.
- Required validation commands pass.
- No global stop condition remains.
- Evidence is recorded for every release-gating risk.

### NO-GO Criteria

Do not release if:

- any required criterion is unchecked;
- Phantom or Jupiter is unverified on a real wallet host;
- any P0 risk remains open;
- any release-critical P1 risk remains open;
- authentication is insecure or duplicated;
- routing isolation fails;
- splash entry can deadlock;
- session readiness is bypassed;
- public-site regression is unexplained;
- validation failures are hidden or unresolved.

---

# Post-Release Track: Should-Have Work

Begin only after Phase 8 receives a GO decision, unless the Tech Lead explicitly authorizes isolated parallel work that cannot affect release-critical paths.

## S1 — Refined Wallet Identity

**Owner:** Frontend Engineer  
**Dependencies:** Phases 3 and 5 complete

### Entry Criteria

- Core authentication and wallet view pass.
- Provider identity data is available.

### Exit Criteria

- Provider treatment is accurate.
- `.gwap` states are clear.
- Avatar fallback works.
- Copy feedback works.
- Explorer links work.
- Network and session status are understandable.
- No primary-wallet regression is introduced.

## S2 — Progressive Wallet Data

**Owner:** Wallet Integration Engineer  
**Dependencies:** Phases 5 and 6 complete

### Entry Criteria

- Shell renders independently of secondary data.
- RPC request patterns are measured.

### Exit Criteria

- SOL, SPL, and activity data load progressively.
- Authentication and shell do not wait on secondary data.
- Request deduplication remains intact.
- RPC usage does not regress.

## S3 — Enhanced Mobile Interaction

**Owner:** Frontend Engineer  
**Dependencies:** Phases 5 and 6 complete

### Entry Criteria

- Core mobile shell passes.
- Safe-area and viewport behavior pass.

### Exit Criteria

- Sheets, keyboard-aware layouts, touch feedback, back navigation, and orientation handling work.
- Wallet navigation is not interrupted.
- Critical controls remain reachable.

## S4 — Visual Polish

**Owner:** Product/Design Owner  
**Dependencies:** Phases 4 and 6 complete

### Entry Criteria

- Splash and performance baselines pass.
- Visual direction is approved.

### Exit Criteria

- Glass, typography, lighting, provider accents, and motion are refined.
- Readability and contrast remain strong.
- No WebView jank or obscured actions are introduced.
- Performance targets remain within tolerance.

## S5 — Observability

**Owner:** Auth/Security Engineer  
**Dependencies:** Phase 3 complete

### Entry Criteria

- Security logging rules are approved.
- Sensitive-data redaction is defined.

### Exit Criteria

- Detection, authentication, splash fallback, session readiness, and redirect prevention are observable.
- Identifiers are redacted.
- Signatures, tokens, secrets, and private data are never logged.
- Failure diagnostics are actionable.

## S6 — Broader Wallet Compatibility

**Owner:** Wallet Integration Engineer  
**Dependencies:** Phantom and Jupiter pass Phase 8

### Entry Criteria

- Phantom and Jupiter have verified real-wallet flows.
- Provider-specific behavior is isolated.

### Exit Criteria

- Solflare, Backpack, and additional Wallet Standard hosts are validated.
- Unsupported capabilities are documented.
- Phantom and Jupiter regression suites still pass.
- No primary-wallet reliability or security regression is introduced.

### Stop Condition for All Should-Have Work

Stop and revert or defer if the work compromises:

- security;
- authentication;
- performance;
- RPC discipline;
- app/public isolation;
- Phantom reliability;
- Jupiter reliability.

---

# Later Track

Begin only after release and should-have work are stable.

## L1 — Advanced Wallet Activity

Entry criteria:

- Core wallet data is stable.
- RPC budgets and data contracts are approved.

Exit criteria:

- Rich history, metadata, portfolio grouping, filtering, and notifications work without blocking the shell or increasing uncontrolled RPC usage.

## L2 — Expanded GwapOS Navigation

Entry criteria:

- Core app navigation is stable.
- `.gwap` integration requirements are approved.

Exit criteria:

- App launcher, command palette, cross-application state, and deeper `.gwap` integration work without weakening wallet-native simplicity.

## L3 — Advanced Motion and Media

Entry criteria:

- Performance baselines pass.
- Visual polish is approved.

Exit criteria:

- Rich transitions and final-frame effects preserve usability, accessibility, and WebView performance.

## L4 — Wallet-Native Notifications

Entry criteria:

- Observability and session lifecycle are stable.
- Notification behavior has product and security approval.

Exit criteria:

- Session, wallet-change, RPC, and activity notices are actionable, non-sensitive, and non-disruptive.

## L5 — Broader Wallet Actions

Entry criteria:

- Separate product, security, and transaction-signing review is complete.

Exit criteria:

- Approved signing workflows and ecosystem actions are implemented without introducing swaps, bridges, trading, custody, private-key handling, or unreviewed transaction behavior.

---

# Dependency Sequence

```text
Phase 0 Reconnaissance
→ Phase 1 App/Public Isolation
→ Phase 2 Wallet Detection
→ Phase 3 Authentication and Session State
→ Phase 4 Splash Reliability
→ Phase 5 Wallet-Native Shell and Wallet View
→ Phase 6 WebView/Performance/RPC Hardening
→ Phase 7 Regression Coverage
→ Phase 8 Go/No-Go
```

## Additional Dependencies

```text
Phase 3 → Phase 4
Phase 3 → Phase 5
Phase 3 → Phase 8
Phase 5 → S1
Phase 5 → S2
Phase 5 → S3
Phase 6 → S2
Phase 6 → S4
Phase 6 → L1
Phase 8 Phantom/Jupiter validation → S6
Phase 8 → L2
Phase 8 → L3
```

---

# Release-Gating Risk Checklist

## P0 — Must Be Closed Before Release

- [ ] Phantom real-wallet authentication passes.
- [ ] Jupiter real-wallet authentication passes.
- [ ] Authentication is secure, single-owner, and session-gated.
- [ ] App/public routing isolation passes.
- [ ] Splash cannot permanently block entry.

## P1 — Release-Critical

- [ ] WebView performance does not impair wallet interaction.
- [ ] Public website has no unexplained regression.
- [ ] Wallet provider initialization is explicit and recoverable.
- [ ] Wallet account changes synchronize with the authenticated session.
- [ ] RPC duplication and retry storms are controlled.
- [ ] App sign-in contains no email-wallet onboarding.

## P2 — Required Before Broad Release Unless Documented

- [ ] Safe areas, keyboard, viewport, and wallet chrome are verified.
- [ ] Returning sessions avoid unnecessary signatures without weakening security.
- [ ] Every critical failure state has a recovery action.
- [ ] Visual polish does not harm clarity or performance.

## P3 — Defer Rather Than Destabilize

- [ ] Broader wallet support does not regress Phantom or Jupiter.
- [ ] Observability contains no sensitive authentication or wallet data.

---

# Repository and Commit Checklist

## Before Modification

- [ ] Run `git status`.
- [ ] Run `git branch --show-current`.
- [ ] Review recent commits.
- [ ] Review recent app/wallet changes.
- [ ] Confirm focused branch.
- [ ] Confirm unrelated work is preserved.

## During Implementation

- [ ] Keep commits focused by workstream.
- [ ] Preserve public-site behavior.
- [ ] Record owner, dependency, and validation evidence for each phase.
- [ ] Do not suppress failures with `any`, `@ts-ignore`, `eslint-disable`, or `skipLibCheck` without documented review.
- [ ] Do not merge automatically.

## Suggested Commit Groups

- [ ] App-domain isolation.
- [ ] Host-wallet authentication.
- [ ] Splash recovery.
- [ ] Wallet identity surface.
- [ ] WebView/RPC hardening.
- [ ] Phantom/Jupiter regression coverage.

---

# Validation Checklist

Run only repository-defined commands:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Record:

- [ ] Install result.
- [ ] Lint result.
- [ ] TypeScript result.
- [ ] Test result.
- [ ] Build result.
- [ ] Preview result.
- [ ] Production result, if authorized.
- [ ] Real-wallet evidence.
- [ ] Public-site regression evidence.
- [ ] Open-risk count.

---

# Progress Report Template

```text
FOUND:
<problem>

CAUSE:
<root cause>

FIXING:
<action>

OWNER:
<responsible role>

DEPENDENCIES:
<required prior work>

ENTRY CRITERIA:
<criteria confirmed>

EXIT CRITERIA:
<criteria to verify>

VALIDATION:
<commands, tests, or manual checks>

STATUS:
<in progress / blocked / complete>
```

# Final Release Report

```text
STATUS:
GO / NO-GO

CURRENT PHASE:
<phase>

APP-ONLY BOUNDARY:
PASS / FAIL

PHANTOM:
PASS / FAIL / NOT VERIFIED ON REAL WALLET HOST

JUPITER:
PASS / FAIL / NOT VERIFIED ON REAL WALLET HOST

AUTHENTICATION SECURITY:
PASS / FAIL

SPLASH RECOVERY:
PASS / FAIL

WALLET VIEW:
PASS / FAIL

MOBILE WEBVIEW:
PASS / FAIL

PUBLIC WEBSITE:
PASS / REGRESSION FOUND

VALIDATION:
npm ci:
Lint:
TypeScript:
Tests:
Build:
Preview:
Production:

RISK REGISTER:
P0 open:
P1 open:
P2 open:
P3 open:
Highest remaining risk:
Required mitigation:
Verification evidence:

BLOCKERS:
- ...

CHANGES:
- ...

SECURITY:
PASS / ISSUES

PR:
<branch / PR>

NEXT:
<single highest-priority action>
```

# Master Principle

`gwapspot.com` is the public GWAP gateway.

`app.gwapspot.com` is GwapOS inside the wallet.

They share infrastructure, but they are not the same interface.
