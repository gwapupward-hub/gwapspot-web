# GWAP OS authentication activation

The codebase is safe to merge before credentials exist. `/app` stays locked until
both Clerk keys are present.

## Required production setup

1. Create or select the Clerk **production** instance for GWAPSpot.
2. Add its matching `pk_live_...` and `sk_live_...` keys to the Vercel
   **Production** environment. Never use `pk_test_...` or `sk_test_...` on
   `gwapspot.com`.
3. Keep local and preview deployments on a matching test-key pair.
4. In Clerk, enable email, Google, GitHub, and Solana wallet sign-in.
5. Add `https://www.gwapspot.com/sign-in` and the active Vercel preview pattern
   to Clerk's allowed redirect URLs.
6. Add Clerk's production Google and GitHub OAuth credentials. Never place them
   in this repository.
7. Confirm self-service account deletion is enabled.
8. Make `www.gwapspot.com` the primary Clerk application domain. The app
   permanently redirects the apex domain to `www`.

GWAPSpot does not require a custom Clerk Frontend API proxy. Do not set
`NEXT_PUBLIC_CLERK_PROXY_URL` unless proxying is deliberately enabled in the
Clerk Dashboard and implemented end-to-end. A half-configured proxy produces
Clerk's raw `host_invalid` JSON response.

## Release verification

- Signed-out users are redirected from `/app`, `/app/profile`, and `/app/settings`.
- `/api/health` returns `authentication.configured: true`, `keyMode: "live"`,
  and `reason: "ready"` in production.
- Email, Google, GitHub, and Solana wallet sign-in complete successfully.
- Existing local workspace data offers a one-time account migration.
- Profile, favorites, recent activity, and settings survive another device login.
- Sign-out, account deletion, expired sessions, and rejected writes show safe errors.
- Public marketing, ecosystem, launchpad, and legal routes remain public.

## Cost boundary

Workspace state uses protected Clerk metadata and is capped below Clerk's 8 KB
metadata limit. Add a database only when the state model outgrows that ceiling or
needs relational queries.

## `host_invalid` recovery

If Clerk returns `Invalid host`, verify that Vercel Production contains a
matching live key pair from the same Clerk production instance, remove any stale
`NEXT_PUBLIC_CLERK_PROXY_URL`, and redeploy. The app intentionally leaves GWAP OS
inactive when production receives test keys so public pages remain available.
