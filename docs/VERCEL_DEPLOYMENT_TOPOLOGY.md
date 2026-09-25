# Vercel split-project deployment policy

GWAPSpot uses one GitHub repository with two production Vercel projects:

- `gwapspot-app` owns `app.gwapspot.com`.
- `gwapspot-web` owns `gwapspot.com` and `www.gwapspot.com`.

Both projects must continue to build production commits because host-aware routing and
environment configuration differ by project.

## Automatic previews

Only `gwapspot-app` creates automatic Preview deployments.

`gwapspot-web` Preview builds are skipped by `scripts/vercel-ignore-build.mjs`.
This prevents every pull-request commit from consuming two Vercel builds.

When a public-site change specifically needs its own Vercel Preview, trigger a manual
`gwapspot-web` preview rather than re-enabling duplicate automatic previews.

## Production

Production builds are never skipped by the ignored-build policy. A merge to `main`
continues to deploy both projects.

## Scheduled workers

Because both projects read the same `vercel.json`, Vercel sees the same cron schedule
on each project. Scheduled application workers execute only on `gwapspot-app`.

The non-canonical project returns a successful no-op response for Vercel Cron requests.
Manual/internal worker calls authenticated by their worker keys remain available on
either project.

Canonical scheduled workers:

- `/api/gwapscore/snapshots/collect`
- `/api/ppv/reconcile`

This prevents duplicate snapshots and duplicate PPV reconciliation work while keeping
the shared repository and split production domains intact.
