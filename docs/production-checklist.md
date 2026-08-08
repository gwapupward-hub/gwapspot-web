# Production checklist

- GitHub Quality workflow passes.
- Vercel preview is READY.
- The production deployment is built from the latest `main` commit, not a
  promoted preview branch.
- `/api/health` returns 200 and reports `privy-siws` authentication and workspace
  storage as ready.
- `/api/health` reports `storageSource` as `upstash`, `vercel-kv`, or
  `redis-url` without returning credentials.
- Privy production cookie auth is active for `www.gwapspot.com`; preview uses a
  separate Privy app.
- The selected Redis credentials are scoped to the Vercel project and use a
  separate Preview database or namespace.
- A dedicated Solana mainnet RPC is configured.
- External-wallet SIWS, email-created embedded wallet, session refresh, sign-out,
  wallet export, workspace reset, and account deletion pass smoke tests.
- `gwapspot.com` permanently redirects to `www.gwapspot.com`.
- `/gwap-splash.webp` returns a static WebP.
- Homepage, ecosystem, about, roadmap, community, contact, privacy, and terms
  routes load without wallet-authentication JavaScript.
- Reduced-motion mode disables cinematic transforms.
- Production runtime errors and wallet rejection states remain clear after
  release.
