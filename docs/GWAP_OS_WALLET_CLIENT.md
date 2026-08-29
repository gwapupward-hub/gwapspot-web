# app.gwapspot.com — the wallet-hosted GWAP OS client

`gwapspot.com` is the public gateway. `app.gwapspot.com` is GWAP OS opened from
inside a Solana wallet. They share the backend, accounts, and product logic;
they do not share a cockpit.

## Two gates, not one

A GWAP OS surface renders only when both gates pass.

**Gate one — exact hostname.** `isGwapAppHostname` matches
`app.gwapspot.com` exactly, never by suffix, so `evil-app.gwapspot.com.attacker.test`
is not the app host. The proxy applies it to every request and rewrites `/` to
the GWAP OS splash, redirects `/sign-in` to `/os-sign-in`, and refuses marketing
paths on the app domain.

**Gate two — wallet environment.** `WalletHostGate` establishes that the client
is a supported Solana wallet before GWAP OS renders. Off the app hostname it is
transparent, so the public website and preview deployments are untouched.

## How a wallet is detected

Detection is capability-first (`app/lib/wallet-host.ts`,
`app/components/use-wallet-host.ts`):

1. The Wallet Standard handshake — dispatch `wallet-standard:app-ready` and
   listen for `wallet-standard:register-wallet`.
2. Injected Solana providers (`window.phantom.solana`, `window.solana`,
   `window.solflare`, `window.backpack`, `window.jupiter`).
3. A wallet counts as Solana-capable through its `solana:` chains or features,
   and as authentication-capable through `solana:signMessage` or `solana:signIn`.

A user-agent string is **secondary evidence only**. It can label an anonymous
provider; it can never open the gate on its own.

Wallets inject asynchronously inside their own WebView, so detection settles
rather than snapping: it resolves immediately on a positive result, waits
`DETECTION_SETTLE_MS` before declaring an ordinary browser, and keeps listening
for late registration plus `visibilitychange`/`focus`. A wallet host, once
established, is never revoked by a later probe.

Acceptance priority is Phantom, Jupiter, Solflare, Backpack, then any other
Wallet Standard host. A wallet that is detected but cannot sign stays a wallet
host so the client shows the signature failure state — not the browser gateway.

## What an ordinary browser gets

A restrained hand-off (`WalletHostRequired`): what to do, which wallets work,
inline instructions, a copyable link, a link to the public website, and a
"detect again" recovery for a false negative. It never silently redirects and
never renders the public website in place of GWAP OS.

## Authentication ownership

Privy owns wallet selection, connection, the Sign-In with Solana signature, the
session, and the access token. The Solana wallet adapter stays mounted for
downstream compatibility with no adapters of its own and `autoConnect={false}`,
so it cannot open a competing connection flow.

`buildWalletAuthConfig` (`app/lib/wallet-auth-config.ts`) is the single place
the two clients diverge:

| | `gwapspot.com` | `app.gwapspot.com` |
| --- | --- | --- |
| Login methods | `wallet`, `email` | `wallet` |
| Embedded Solana wallet | created for users without one | `off` |
| Wallet list | acceptance priority | detected host first |

Inside a wallet the user already has a wallet, so the app client never offers
email onboarding or an embedded wallet. The public website owns that path.

## Sessions

A connected address is not proof of account ownership. Every request is verified
server-side against a Privy-issued access token (`app/lib/privy-server.ts`); the
client never asserts an identity.

- A valid session with the same wallet enters GWAP OS without a new signature.
- `WalletSessionGuard` watches the host wallet for `accountChanged`. Switching to
  a different account ends the session and returns to the wallet gateway, because
  the session was issued to the wallet that proved ownership.
- A rejected signature leaves the user signed out with a recoverable error.

## Redirects

`walletSignInPathForHost` sends app-host traffic to `/os-sign-in` and public
traffic to `/sign-in`, from the proxy, the `/app` layout, and `/refresh` alike.
`/os-sign-in` is itself an allowed app path, so the round trip terminates
instead of bouncing back to `/app`.

## Splash

The splash (`/os-entry`) is deliberately outside the gate: playback failure must
never block entry, and the gate lives on the surface past it. Autoplay
rejection, playback errors, stalls, reduced motion, and an absolute deadline all
resolve to the final frame with "Enter Tha GwapSpot" available.
