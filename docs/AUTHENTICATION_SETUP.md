# Sprint 5 wallet authentication activation

GWAP OS is wallet-first. External Solana wallets are detected through Privy's
Wallet Standard connectors and authenticate by signing a Sign-In with Solana
message. People who do not have a wallet can verify an existing email address;
Privy then creates an embedded Solana wallet for that account. GWAPSpot does not
offer a separate username/password identity.

The codebase is safe to merge before credentials exist. `/app` stays locked until
both wallet authentication and workspace storage are configured.

## Privy setup

1. Create separate Privy apps for local/preview and production.
2. Enable both **Email** and **Solana wallet** authentication in the Privy
   Dashboard. Confirm the public app configuration reports
   `solana_wallet_auth: true` before release.
3. Under **Allowed origins**, register both `https://www.gwapspot.com` and
   `https://app.gwapspot.com`. Keep the protocol and do not add route paths.
4. Enable automatic **Solana** embedded wallet creation for users without a
   wallet. Keep automatic Ethereum wallet creation off.
5. Enable cookie-based authentication. Register the root domain `gwapspot.com`
   (without the protocol or `www`) and add the DNS records Privy provides. The
   root cookie domain covers both `www.gwapspot.com` and `app.gwapspot.com`,
   which expect the HttpOnly `privy-token` and `privy-session` cookies for server
   rendering and session refresh.
6. Add the production app ID, optional web client ID, and app secret to Vercel.
   Never place the app secret in a `NEXT_PUBLIC_` variable.
7. Keep the production and preview credentials isolated. Add each stable preview
   origin required by Privy before testing its login flow.

Required authentication variables:

```text
NEXT_PUBLIC_PRIVY_APP_ID
NEXT_PUBLIC_PRIVY_CLIENT_ID  # optional
PRIVY_APP_SECRET
```

## Wallet connector boundary

Privy's `toSolanaWalletConnectors` owns external-wallet discovery and SIWS.
Phantom, Jupiter Wallet, Solflare, Backpack, and other Wallet Standard wallets
are detected in their in-app browsers. Do not remove
`externalWallets.solana.connectors` from the `PrivyProvider`; Privy will warn and
mobile wallet connection will become unreliable.

Solana Wallet Adapter remains mounted without bundled legacy adapters for
downstream compatibility. It must not auto-connect in parallel with Privy.
Authenticated GNS signing and registration fall back to Privy's connected
Solana wallet.

## Workspace storage and rate limits

Install an Upstash Redis integration from the Vercel Marketplace and connect it
to the project. Add the preferred variables to every environment that should
unlock GWAP OS:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Existing Vercel KV integrations that provide `KV_REST_API_URL` and
`KV_REST_API_TOKEN` are also accepted. A URL and token must come from the same
variable pair; incomplete or mixed pairs keep the workspace locked.

Redis Cloud and other direct Redis providers are supported through a server-only
`REDIS_URL`. Use the provider's complete connection URL and prefer `rediss://`
when TLS is available. A valid `REDIS_URL` is an explicit override and takes
precedence over auto-provisioned Upstash or Vercel KV variables. Never commit or
share a connection URL; it contains the database password.

Redis stores normalized workspace state under a SHA-256-derived account key. It
also stores five-minute identity cache entries and distributed fixed-window rate
limits. Raw Privy user IDs, access tokens, wallet signatures, and wallet private
keys are never stored in workspace records or application logs.

## Solana RPC

Set `NEXT_PUBLIC_SOLANA_RPC_URL` to a dedicated mainnet RPC endpoint in
production. The public Solana endpoint in `.env.example` is a development
fallback and can be rate limited.

## Release verification

- Deploy the latest `main` commit; do not promote a stale preview-branch build.
- The app splash animates when autoplay is available and exposes the final-frame
  entry action when autoplay is blocked, playback stalls, or reduced motion is
  requested.
- Signed-out users are redirected from `/app`, `/app/profile`, and
  `/app/settings` to the host-appropriate sign-in route.
- `/api/health` returns `authentication.provider: "privy-siws"`,
  `configured: true`, and `reason: "ready"`.
- Privy's public production configuration reports `solana_wallet_auth: true`.
- `storageSource` reports `upstash`, `vercel-kv`, or `redis-url`; secret values
  are never returned.
- Phantom and Jupiter Wallet in-app browsers can connect, sign a message, enter
  GWAP OS, sign out, and reconnect.
- Solflare, Backpack, and a desktop Wallet Standard wallet complete the same
  flow.
- Rejecting a signature leaves the user signed out and shows a safe error.
- Email OTP login creates a Solana embedded wallet and enters GWAP OS without a
  browser extension.
- Expired access tokens refresh through `/refresh`; invalid sessions return to
  the correct sign-in host without an open redirect.
- API writes reject cross-origin requests, oversized payloads, invalid tokens,
  and rate-limit excesses.
- Public marketing, ecosystem, launchpad, and legal routes remain public and do
  not mount the wallet authentication providers.

## Account deletion boundary

Deleting a GWAP OS account first revokes its developer API access and removes
its Redis workspace and inactive billing entitlement, then removes the Privy
user. An active or past-due Stripe subscription blocks deletion because this
billing slice does not hold a Stripe secret key and therefore cannot cancel the
upstream subscription safely. The identity remains valid if application-data
cleanup fails so the deletion can be retried. An external wallet is not deleted.
An email-created embedded wallet can become inaccessible after deletion, so the
settings screen explicitly offers export and warns the user first. GWAPSpot
never receives the exported private key.
