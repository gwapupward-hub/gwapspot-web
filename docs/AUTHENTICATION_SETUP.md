# Sprint 5 wallet authentication activation

GWAP OS is wallet-first. External Solana wallets connect through Solana Wallet
Adapter and authenticate by signing a Sign-In with Solana message. People who do
not have a wallet can verify an existing email address; Privy then creates an
embedded Solana wallet for that account. GWAPSpot does not offer a separate
username/password identity.

The codebase is safe to merge before credentials exist. `/app` stays locked until
both wallet authentication and workspace storage are configured.

## Privy setup

1. Create separate Privy apps for local/preview and production.
2. Enable **Email** as the only dashboard login method. External wallet login is
   handled headlessly by the Solana Wallet Adapter + Privy SIWS flow in this app.
3. Enable automatic **Solana** embedded wallet creation for users without a
   wallet. Keep automatic Ethereum wallet creation off.
4. Enable cookie-based authentication. Register the root domain `gwapspot.com`
   (without the protocol or `www`) and add the DNS records Privy provides. The
   production app runs on `www.gwapspot.com` and expects the HttpOnly
   `privy-token` and `privy-session` cookies for server rendering and session
   refresh.
5. Add the production app ID, optional web client ID, and app secret to Vercel.
   Never place the app secret in a `NEXT_PUBLIC_` variable.
6. Keep the production and preview credentials isolated. Add each preview origin
   required by Privy before testing its login flow.

Required authentication variables:

```text
NEXT_PUBLIC_PRIVY_APP_ID
NEXT_PUBLIC_PRIVY_CLIENT_ID  # optional
PRIVY_APP_SECRET
```

## Workspace storage and rate limits

Install an Upstash Redis integration from the Vercel Marketplace and connect it
to the project. Add these variables to every environment that should unlock
GWAP OS:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Redis stores normalized workspace state under a SHA-256-derived account key. It
also stores five-minute identity cache entries and distributed fixed-window rate
limits. Raw Privy user IDs, access tokens, wallet signatures, and wallet private
keys are never stored in workspace records or application logs.

## Solana RPC

Set `NEXT_PUBLIC_SOLANA_RPC_URL` to a dedicated mainnet RPC endpoint in
production. The public Solana endpoint in `.env.example` is a development
fallback and can be rate limited.

Wallet Adapter is configured with an empty adapter list so Wallet Standard
wallets are discovered directly. Do not add the legacy
`@solana/wallet-adapter-wallets` bundle.

## Release verification

- Signed-out users are redirected from `/app`, `/app/profile`, and
  `/app/settings`.
- `/api/health` returns `authentication.provider: "privy-siws"`,
  `configured: true`, and `reason: "ready"`.
- Phantom, Solflare, Backpack, and another Wallet Standard-compatible wallet can
  connect, sign a message, enter GWAP OS, sign out, and reconnect.
- Rejecting a signature leaves the user signed out and shows a safe error.
- Email OTP login creates a Solana embedded wallet and enters GWAP OS without a
  browser extension.
- The embedded-wallet export control opens before destructive account deletion.
- Existing local Sprint 5 state offers a one-time migration after first login.
- Profile, favorites, recent activity, and settings survive another-device login.
- Expired access tokens refresh through `/refresh`; invalid sessions return to
  `/sign-in` without an open redirect.
- API writes reject cross-origin requests, oversized payloads, invalid tokens,
  and rate-limit excesses.
- Public marketing, ecosystem, launchpad, and legal routes remain public and do
  not mount the wallet authentication providers.

## Account deletion boundary

Deleting a GWAP OS account removes the Privy user and Redis workspace. An
external wallet is not deleted. An email-created embedded wallet can become
inaccessible after deletion, so the settings screen explicitly offers export
and warns the user first. GWAPSpot never receives the exported private key.
