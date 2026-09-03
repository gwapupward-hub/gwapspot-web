# GwapOS Wallet-Native Application — Phase Audit

Audit of `app.gwapspot.com` against the `gwapos-wallet-native-app` execution
skill. Read-only: no application code was changed to produce this report.

- **Branch audited:** `claude/new-session-qzjnzq` (from `e276450`)
- **Date:** 2026-08-29
- **Scope:** Phases 0–8 plus the release-gating risk register
- **Verdict:** **NO-GO** — 2 P0 and 3 P1 risks open

---

## Baseline validation

Run on a clean `npm ci` tree.

| Command | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run lint` | PASS — 0 errors, 11 warnings (`no-img-element` ×10, 1 unused var) |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 128/128 |
| `npm run build` | PASS |
| Preview | NOT RUN — no deployment exercised |
| Production | NOT RUN — not authorized in this audit |
| Real-wallet evidence | NONE — no Phantom or Jupiter host available |

The repository is green. Every finding below is a behavioural or coverage gap
that the current suite does not detect.

---

## Phase status summary

| Phase | Status | Blocking finding |
| --- | --- | --- |
| 0 — Reconnaissance and baseline | **COMPLETE** | — |
| 1 — App-domain and client isolation | **BLOCKED** | F-02 email-wallet onboarding; F-03 no wallet-host gateway |
| 2 — Wallet-host detection | **NOT STARTED** | F-03 — no detection code exists |
| 3 — Authentication and session state | **BLOCKED** | F-01 redirect loop; F-05 no state machine |
| 4 — Splash reliability | **NEARLY COMPLETE** | F-06 no lifecycle recovery |
| 5 — Wallet-native shell and wallet view | **PARTIAL** | F-07 sign-out/disconnect conflated; F-08 no provider identity |
| 6 — WebView, performance, RPC | **PARTIAL** | F-04 safe areas inert; F-09 duplicate RPC |
| 7 — Regression coverage | **PARTIAL** | F-10 no proxy, splash, or session tests |
| 8 — Go/No-Go | **NO-GO** | P0 and P1 risks open |

---

## What is already done well

Phase 0 exit criteria are satisfied and several later phases are substantially
built. Credit where the work is solid:

- **Hostname validation is correct and exactly matched.** `isGwapAppHostname`
  compares the normalized host to a constant, handles comma-separated
  `x-forwarded-host` chains, strips ports, and unwraps bracketed IPv6
  literals. `app/lib/app-domain-routing.test.mjs` explicitly rejects
  `evil-app.gwapspot.com.attacker.test` and `notapp.gwapspot.com`.
- **The route allowlist rejects prefix lookalikes.** `/application`, `/apps`,
  `/sign-in-now`, and `/os-entrypoint` are all covered by tests.
- **Open-redirect handling is genuinely hardened.** `getSafeRedirectPath`
  rejects the whole C0/DEL control range rather than guessing which characters
  a given URL parser strips, and rejects backslashes alongside `//`.
- **Public-site isolation holds.** `PublicExperienceLayers` returns `null` for
  the app host, `/os-entry`, `/os-sign-in`, `/refresh`, and `/app/*`, so the
  premium splash, telemetry, and interaction layers never mount in the client.
- **Audit logging is already non-sensitive.** `auditAuthEvent` SHA-256-hashes
  the user id and truncates to 12 hex characters; no token, signature, or
  address is logged anywhere in the codebase.
- **Splash failure handling is thorough.** Autoplay rejection, media errors,
  stalled playback, missing startup progress, and reduced-motion each reach the
  interactive final-frame state, with an absolute 15s deadline behind them.

---

## Findings

### F-01 — `/app` ↔ `/os-sign-in` infinite redirect loop on backend failure
**Severity: P0** · Phase 3 stop condition: *"redirect loops remain"*

`getAuthenticatedWalletIdentity` wraps token verification, the Redis identity
cache read, and the Privy user fetch in a single bare `catch { return null }`
(`app/lib/privy-server.ts:78-99`). A `null` return is indistinguishable from
"not signed in", so a **transient Redis outage or Privy 5xx makes a valid
session look unauthenticated**.

The loop:

1. `app/app/layout.tsx:31` — identity is `null`, so `redirect("/sign-in?redirect_url=/app")`.
2. `proxy.ts:21-26` — on the app domain, `/sign-in` redirects to `/os-sign-in`.
3. `app/components/wallet-sign-in.tsx:67-75` — Privy is still `authenticated`
   with a linked Solana wallet, so the effect fires `navigateWhenSessionReady`.
4. `waitForAccessToken` returns the still-valid token, so
   `window.location.replace("/app")`.
5. `proxy.ts:42` — the `privy-token` cookie is present, so the request passes.
6. Back to step 1.

Nothing breaks the cycle: no attempt counter, no backoff, no distinct error
state. The user sees a flashing white screen until they close the tab.

`/refresh` has the same shape (`app/components/refresh-session-client.tsx:14-32`):
if `getAccessToken()` resolves a token from memory but the `privy-token`
cookie is not written, the proxy sees `privy-session` without `privy-token`
and routes back to `/refresh` indefinitely.

**Fix direction:** separate "token invalid" (sign in) from "backend
unavailable" (503 with a retry action) in `getAuthenticatedWalletIdentity`,
and add a bounded redirect counter — a `?auth_attempt=n` parameter or a
short-lived cookie — that lands on a terminal error page after 2 hops.

---

### F-02 — Email-wallet onboarding is still in the app-domain sign-in
**Severity: P1** · Phase 1 stop condition: *"email-wallet onboarding remains in the app client"* · P1 register: *"App sign-in contains no email-wallet onboarding"*

`WalletSignIn` renders the **"Create a Solana wallet with email"** button and
its explanatory copy unconditionally — the `isAppVariant` flag gates the
navigation, logo row, eyebrow, heading, and legal links, but not the email CTA
(`app/components/wallet-sign-in.tsx:157-170`). `/os-sign-in` passes
`variant="app"` and still shows it.

The provider agrees: `walletAuthConfig` sets `loginMethods: ["wallet", "email"]`
and `embeddedWallets.solana.createOnLogin: "users-without-wallets"`
(`app/components/wallet-auth-provider.tsx:26,46`), and a single
`WalletAuthProvider` instance serves both the public site and the app client,
so there is currently no way for the app domain to run a wallet-only Privy
config.

**Fix direction:** gate the email CTA on `!isAppVariant`, and give
`WalletAuthProvider` a variant prop that narrows `loginMethods` to `["wallet"]`
and sets `createOnLogin: "off"` for the app domain.

---

### F-03 — No wallet-host detection and no ordinary-browser gateway
**Severity: P0** · Phase 1 stop condition: *"the full app renders outside wallet hosts"* · Phase 2 is entirely unstarted

A repository-wide search for `isWalletHost`, `walletHost`, `wallet-standard`,
`isPhantom`, or a `signMessage` capability probe returns **no detection code**.
Every Phase 2 checklist item is unimplemented:

- No capability-based detection, and no UA-based detection either.
- No `signMessage` support check.
- No handling for delayed provider injection.
- No distinction between missing, delayed, unsupported, and ready providers.
- No provider lifecycle handling across reload or background/foreground.

The consequence for Phase 1: `/os-sign-in` is *named* a gateway
(`gateway.module.css`, "IDENTITY GATEWAY") but it gates nothing. An ordinary
iOS Safari or desktop Chrome visitor to `app.gwapspot.com` gets the full
GwapOS client and the full Privy wallet selector, which is the exact Phase 1
exit criterion that must not hold.

`walletList` in the Privy config prioritises `phantom` and `jupiter`
(`app/components/wallet-auth-provider.tsx:32-39`), which is a display-order
preference inside the selector modal — not host detection, and not a
substitute for it.

**Fix direction:** this is the largest single piece of missing work and the
next unblocked phase in the skill's dependency order. Implement capability
detection against the Wallet Standard registry with a bounded wait for
delayed injection, classify into `missing | delayed | unsupported | ready`,
and render a wallet-host-required page for anything but `ready`.

---

### F-04 — Safe-area insets are inert; the dock sits under the home indicator
**Severity: P1** · Phase 6 stop condition: *"controls are obscured"*

The root viewport export omits `viewportFit` (`app/layout.tsx:41`):

```ts
export const viewport: Viewport = { themeColor: "#030504", colorScheme: "dark", width: "device-width", initialScale: 1 };
```

Without `viewport-fit: cover`, iOS resolves every `env(safe-area-inset-*)` to
`0`. `viewportFit: "cover"` is set on exactly one route — `app/telegram/page.tsx:16`
— so **all safe-area CSS elsewhere in the project is currently dead**.

Independently, the app shell never asks for the insets in the first place.
`grep safe-area-inset` matches `premium-ui-scroll.css`, `premium-splash.css`,
the two Telegram modules, `homepage-scroll-polish.css`, and
`os-sign-in/gateway.module.css` — but **not** `gwap-os-v2.css`, `gwap-os.css`,
or `os-entry/splash.module.css`. The primary navigation is pinned with a fixed
offset (`app/gwap-os-v2.css:171,382`):

```css
.os-dock { ... bottom: 8px; }
@media (...) { .os-dock { width: min(calc(100% - 18px), 430px); bottom: 8px; } }
```

On an iPhone with a home indicator, inside Phantom's or Jupiter's WebView, the
dock — the app's only navigation — renders 8px from the viewport bottom,
underneath the indicator and the wallet's bottom chrome.

**Fix direction:** add `viewportFit: "cover"` to the root viewport export, then
change the dock offset to `calc(8px + env(safe-area-inset-bottom))` and apply
the same treatment to the splash entry button and the shell menubar.

---

### F-05 — The required session state machine does not exist
**Severity: P1** · Phase 3 required state sequence

The skill specifies eight explicit states:

```text
SPLASH → READY_TO_ENTER → DETECTING_WALLET → AUTHORIZING_WALLET
→ WAITING_FOR_SIGNATURE → ESTABLISHING_SESSION → OPENING_GWAP_OS → READY
```

What exists instead is four disconnected booleans spread across three
components: `showEnter` / `playbackFailed` in `splash.tsx`, `redirecting` /
`navigationStarted` in `wallet-sign-in.tsx`, and `started` in
`refresh-session-client.tsx`. Three of the eight states have no representation
at all — `DETECTING_WALLET` and `AUTHORIZING_WALLET` because Phase 2 does not
exist, and `WAITING_FOR_SIGNATURE` because the signature prompt is inside
Privy's modal and the app never observes it.

The practical cost is user-visible: between tapping "Connect Solana wallet"
and the wallet app returning, the button reads "Connect Solana wallet" with no
progress indication, and a rejected signature returns to the same idle state
with only a generic error string.

Session readiness gating itself is otherwise sound — `waitForAccessToken`
retries four times with increasing backoff before navigating
(`app/components/wallet-sign-in.tsx:29-36`), and `/app` is gated server-side in
the layout, not only in the proxy. That part meets the Phase 3 exit criterion.

---

### F-06 — Splash has no background/foreground lifecycle recovery
**Severity: P2** · Phase 4 checklist: *"Recover from wallet WebView background/foreground transitions"*

`GwapOsSplash` registers no `visibilitychange` or `pagehide`/`pageshow`
handler. Wallet WebViews commonly pause and detach `<video>` decoding when
backgrounded; on return the element can be paused mid-timeline with no further
`timeupdate`, `stalled`, or `ended` event.

The 15s `ABSOLUTE_PLAYBACK_DEADLINE_MS` timer does eventually rescue this — but
it is armed once on mount, so a user who backgrounds the app at t=1s and
returns at t=20s finds the timer already fired (correctly revealing Enter),
while one who backgrounds at t=14s and returns at t=40s finds a paused video
and a timer that fired against a stale condition. Entry is not permanently
deadlocked, but recovery is incidental rather than designed.

Everything else in Phase 4 is genuinely complete: autoplay rejection, media
error, stall recovery, missing startup progress, and reduced-motion all route
through `revealFinalFrame`, which unmounts the video and shows the poster with
the Enter link.

---

### F-07 — Sign-out and wallet disconnect are conflated
**Severity: P2** · Phase 5 stop condition: *"sign-out and disconnect are conflated"*

`SignOutButton` performs both actions behind one control
(`app/app/components/sign-out-button.tsx:19-28`):

```ts
if (connected) await disconnect().catch(() => undefined);
await logout();
```

There is no way to end the GwapOS session while staying connected to the
wallet, or to disconnect the wallet without ending the session.

The `disconnect()` call is also dead code today. It comes from
`useWallet()` (`@solana/wallet-adapter-react`), but `WalletAuthProvider`
mounts `WalletProvider` with `walletAdapters: []` and `autoConnect={false}`
(`app/components/wallet-auth-provider.tsx:22,61`), so `connected` is always
`false`. The entire `ConnectionProvider` / `WalletProvider` /
`WalletModalProvider` stack is mounted alongside Privy's connectors but does
no work — it is not a competing authentication owner, but it is a second
wallet stack in the tree and its adapter CSS is imported globally
(`app/layout.tsx:6`).

---

### F-08 — Wallet view lacks provider identity and copy-address
**Severity: P2** · Phase 5 checklist

Against the Phase 5 wallet-identity checklist, the shell header
(`app/app/components/os-shell.tsx:81-88`) provides the shortened address (via
`compactWallet`) and the `.gwap` identity (via `gnsIdentity.fullName`), but not:

- **wallet provider identity** — nothing distinguishes Phantom from Jupiter
  from an embedded wallet in the shell; `walletProvider` is resolved
  server-side (`app/lib/privy-server.ts:59-60`) and surfaced only as prose
  inside settings;
- **copy-address action** — no copy control anywhere in the shell;
- **avatar/profile fallback** — `.os-v2-avatar` is styled but not used in the
  menubar;
- **network/session status** — no cluster or session-expiry indicator.

---

### F-09 — Duplicate SOL balance RPC on the critical path
**Severity: P1** · Phase 6 stop condition: *"RPC duplication remains on the critical path"*

Loading `/app` reads the same SOL balance twice, from two different tiers:

1. **Client → public RPC.** `OsShell` POSTs `getBalance` directly to
   `NEXT_PUBLIC_SOLANA_RPC_URL` from the browser
   (`app/app/components/os-shell.tsx:42-67`).
2. **Client → own API → RPC.** `WalletPortfolioCard`, rendered by
   `dashboard-view.tsx:332`, fetches `/api/wallet/portfolio`, which calls
   `fetchAssetIntelligence` and returns `sol.lamports` for the same wallet
   (`app/api/wallet/portfolio/route.ts:45-58`).

Three problems compound:

- **The RPC endpoint is exposed to the browser.** A `NEXT_PUBLIC_` variable
  ships to every client; the server-side path already has a separate
  `SOLANA_RPC_URL` for exactly this reason (`.env.example:8-11`).
- **The default endpoint will not work.** `.env.example:11` defaults
  `NEXT_PUBLIC_SOLANA_RPC_URL` to `https://api.mainnet-beta.solana.com`, which
  rate-limits browser origins aggressively. Unset it and the effect returns
  early, leaving the balance at `—` permanently.
- **The failure state is not actionable.** `.catch(() => undefined)` leaves the
  header showing `—` with no error, no retry, and no way for the user to tell
  a zero balance from a failed request. This is the Phase 6 stop condition
  *"failure states are blank or non-actionable"*.

Server-side request discipline elsewhere is good: `/api/wallet/portfolio` is
rate-limited to 30 requests per 60s per user with a `Retry-After` header, and
bounds its upstream calls at 8s.

---

### F-10 — No regression coverage for the proxy, splash, or session paths
**Severity: P1** · Phase 7 stop condition: *"critical paths lack test coverage"*

30 test files, 128 passing tests, but the Phase 7 checklist maps onto them
poorly. Of 21 required test categories:

| Covered | Not covered |
| --- | --- |
| Exact-hostname routing | Ordinary-browser gateway |
| Lookalike / suffix rejection | App/public UI isolation |
| App-route allowlist | App email-onboarding exclusion |
| Marketing-route rejection | Wallet-host detection |
| Redirect-parameter safety (`safe-redirect.test.mjs`) | Delayed provider / unsupported capability |
| Wallet auth error mapping (`wallet-auth-error.test.mjs`) | Splash playback and fallback |
| | Authentication readiness |
| | Access-token delay |
| | Rejected signature |
| | Wallet change |
| | Expired session |
| | Duplicate callback |
| | Redirect-loop prevention |
| | Provider-ownership regression |
| | Wallet-view loading and failure states |
| | Public-site regression |

Two structural gaps make several of these hard to add as things stand:

- **`proxy.ts` itself is untested.** The tests cover
  `app/lib/app-domain-routing.ts` — the pure predicates — but nothing exercises
  the middleware's rewrite/redirect decisions. That is where the F-01 loop
  lives.
- **The test glob cannot see root-level files.** `npm test` runs
  `node --test "app/**/*.test.mjs"` (`package.json:12`), so a `proxy.test.mjs`
  written beside `proxy.ts` would be silently skipped. Any proxy test must
  either live under `app/` or the glob must widen.

There is also no component-level test runner configured at all — no jsdom, no
Testing Library — so every splash, sign-in, and shell test category above
requires new infrastructure, not just new test files.

---

## Risk register

### P0 — must be closed before release

| # | Risk | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Phantom real-wallet authentication passes | **OPEN** | No wallet host available in this environment; never verified |
| 2 | Jupiter real-wallet authentication passes | **OPEN** | Same |
| 3 | Authentication is secure, single-owner, session-gated | **OPEN** | Single owner ✓ and `/app` gated server-side ✓, but F-01 redirect loop |
| 4 | App/public routing isolation passes | **OPEN** | Hostname and path isolation ✓, but F-03 — no wallet-host gate |
| 5 | Splash cannot permanently block entry | **CLOSED** | Five independent fallback paths converge on `revealFinalFrame` |

### P1 — release-critical

| # | Risk | Status | Evidence |
| --- | --- | --- | --- |
| 1 | WebView performance does not impair wallet interaction | **OPEN** | F-04 — dock under the home indicator |
| 2 | Public website has no unexplained regression | **CLOSED** | `PublicExperienceLayers` isolation verified; no public file touched |
| 3 | Wallet provider initialization is explicit and recoverable | **OPEN** | F-03 — no initialization model exists |
| 4 | Wallet account changes synchronize with the session | **OPEN** | No `accountChanged` listener anywhere in the codebase |
| 5 | RPC duplication and retry storms are controlled | **OPEN** | F-09 — duplicate `getBalance` |
| 6 | App sign-in contains no email-wallet onboarding | **OPEN** | F-02 |

### P2 — required before broad release unless documented

| # | Risk | Status |
| --- | --- | --- |
| 1 | Safe areas, keyboard, viewport, wallet chrome verified | **OPEN** — F-04; no keyboard testing performed |
| 2 | Returning sessions avoid unnecessary signatures | **CLOSED** — Privy session cookie + `/refresh` path handles this |
| 3 | Every critical failure state has a recovery action | **OPEN** — F-09 balance, F-05 rejected signature |
| 4 | Visual polish does not harm clarity | **OPEN** — 6px dock labels and metadata text (`gwap-os-v2.css:188`, `:147`) |

### P3 — defer rather than destabilize

| # | Risk | Status |
| --- | --- | --- |
| 1 | Broader wallet support does not regress Phantom/Jupiter | **N/A** — no wallet-specific code to regress yet |
| 2 | Observability contains no sensitive auth or wallet data | **CLOSED** — `auditAuthEvent` hashes actor ids; no token/signature/address logging found |

**Highest remaining risk:** F-03. It is simultaneously a P0 (the full client
renders outside wallet hosts) and the blocking dependency for Phase 2, which
in turn gates the Phase 3 state machine.

---

## Evidence gaps this audit cannot close

Stated plainly rather than assumed away:

1. **SIWS properties are vendor-owned and unverifiable in-repo.** The skill
   requires SIWS challenges to be "fresh, audience-bound, and non-replayable".
   This codebase implements no SIWS itself — the only reference is a
   `provider: "privy-siws"` label in `app/api/health/route.ts:35`. Freshness,
   audience binding, and replay protection are properties of Privy's hosted
   flow. They should be evidenced from Privy's documentation and dashboard
   configuration, not from this repository.
2. **No real-wallet testing was performed.** Phantom, Jupiter, Solflare, and
   Backpack all remain unverified. This alone is a NO-GO under the skill's
   criteria.
3. **No preview or production deployment was exercised.** All findings are
   from source reading and local validation.
4. **No performance measurement.** The 60fps / CLS < 0.05 / TBT < 150ms targets
   are unmeasured. F-04 and F-09 are structural findings, not profiling
   results.

---

## Recommended order of work

Following the skill's dependency sequence, and ordered so each item unblocks
the next:

1. **F-01** — break the redirect loop. Smallest change, largest user-facing
   failure, and independent of every other finding.
2. **F-02** — remove the email CTA and narrow the app-domain Privy config.
   Self-contained; closes a P1.
3. **F-03** — build Phase 2 wallet-host detection and the ordinary-browser
   gateway. The critical path: closes a P0 and unblocks Phases 3 and 5.
4. **F-05** — model the eight-state sequence once detection can supply
   `DETECTING_WALLET` and `AUTHORIZING_WALLET`.
5. **F-04, F-09** — Phase 6 hardening: `viewportFit`, dock insets, and a single
   source for SOL balance with a retryable failure state.
6. **F-07, F-08, F-06** — Phase 5 and 4 polish.
7. **F-10** — Phase 7 coverage, including the test-glob widening that proxy
   tests require.
8. **Phase 8** — real Phantom and Jupiter runs on physical devices. Nothing in
   this list substitutes for them.

---

## Final release report

```text
STATUS:
NO-GO

CURRENT PHASE:
Phase 1 blocked; Phase 2 not started

APP-ONLY BOUNDARY:
FAIL — hostname and route isolation pass, wallet-host gateway absent (F-03)

PHANTOM:
NOT VERIFIED ON REAL WALLET HOST

JUPITER:
NOT VERIFIED ON REAL WALLET HOST

AUTHENTICATION SECURITY:
FAIL — single owner and server-side gating pass; redirect loop open (F-01)

SPLASH RECOVERY:
PASS — lifecycle recovery incidental rather than designed (F-06, P2)

WALLET VIEW:
FAIL — no provider identity, no copy-address, sign-out conflated (F-07, F-08)

MOBILE WEBVIEW:
FAIL — safe-area insets inert, dock under home indicator (F-04)

PUBLIC WEBSITE:
PASS — no regression found

VALIDATION:
npm ci:      PASS
Lint:        PASS (0 errors, 11 warnings)
TypeScript:  PASS
Tests:       PASS (128/128)
Build:       PASS
Preview:     NOT RUN
Production:  NOT RUN

RISK REGISTER:
P0 open: 4 of 5
P1 open: 5 of 6
P2 open: 3 of 4
P3 open: 0 of 2
Highest remaining risk:
  F-03 — no wallet-host detection; the full GwapOS client renders in
  ordinary browsers, and Phase 2 is unstarted.
Required mitigation:
  Capability-based Wallet Standard detection with bounded wait for delayed
  injection, plus a wallet-host-required gateway for every non-ready state.
Verification evidence:
  Source audit of proxy.ts, app/lib/app-domain-routing.ts, app/os-entry,
  app/os-sign-in, app/components/wallet-*.tsx, app/app/layout.tsx,
  app/app/components/os-shell.tsx, app/lib/privy-server.ts, and the 30-file
  test suite. Local npm ci / lint / typecheck / test / build all green.

BLOCKERS:
- F-01 /app ↔ /os-sign-in redirect loop on any Redis or Privy failure
- F-03 no wallet-host detection or ordinary-browser gateway
- F-02 email-wallet onboarding present in app-domain sign-in
- F-04 safe-area insets inert; primary navigation obscured on iOS
- F-09 duplicate SOL balance RPC with a non-actionable failure state
- No real Phantom or Jupiter verification

CHANGES:
- None. This audit is read-only; no application code was modified.

SECURITY:
ISSUES — F-01 (availability-driven auth failure loop) and F-03
(unrestricted client exposure outside wallet hosts). No sensitive-data
exposure found: audit logs hash actor ids, and no token, signature, or
address is logged.

PR:
claude/new-session-qzjnzq — audit document only

NEXT:
Fix F-01. It is the smallest change with the largest user-facing impact and
has no dependency on any other finding.
```
