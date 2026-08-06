# GWAP OS authentication activation

The codebase is safe to merge before credentials exist. `/app` stays locked until
both Clerk keys are present.

## Required production setup

1. Add Clerk from the Vercel Marketplace to the `gwapspot-web` project.
2. Scope Clerk keys separately to Development, Preview, and Production.
3. In Clerk, enable email, Google, GitHub, and Solana wallet sign-in.
4. Add `https://www.gwapspot.com/sign-in` and the active Vercel preview pattern
   to Clerk's allowed redirect URLs.
5. Add Clerk's production Google and GitHub OAuth credentials. Never place them
   in this repository.
6. Confirm self-service account deletion is enabled.

## Release verification

- Signed-out users are redirected from `/app`, `/app/profile`, and `/app/settings`.
- Email, Google, GitHub, and Solana wallet sign-in complete successfully.
- Existing local workspace data offers a one-time account migration.
- Profile, favorites, recent activity, and settings survive another device login.
- Sign-out, account deletion, expired sessions, and rejected writes show safe errors.
- Public marketing, ecosystem, launchpad, and legal routes remain public.

## Cost boundary

Workspace state uses protected Clerk metadata and is capped below Clerk's 8 KB
metadata limit. Add a database only when the state model outgrows that ceiling or
needs relational queries.
