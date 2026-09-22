# GWAPSpot Web

One Next.js codebase serves two production surfaces with separate Vercel projects:

- **https://www.gwapspot.com** — public GWAP website and discovery layer.
- **https://app.gwapspot.com** — authenticated GWAP OS application surface.

## Architecture

The split is host-based and deployment-separated.

- `gwapspot-web` owns `gwapspot.com` and `www.gwapspot.com`.
- `gwapspot-app` owns `app.gwapspot.com`.
- Public requests for GWAP OS routes are permanently redirected to `app.gwapspot.com`.
- Public marketing routes requested on `app.gwapspot.com` are normalized back to the app entry.
- `/app/**` remains authenticated and non-indexable.
- Shared API routes and shared assets still live in this repository for now.

The routing contract is implemented in:

- `next.config.ts`
- `app/lib/app-domain-routing.ts`
- `app/lib/proxy-routing.ts`
- `proxy.ts`

Do not add a new app-owned browser route without updating both the app-host allowlist and the public-host canonical redirects.

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Validation

Before merging:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Route ownership

| Surface | Canonical host | Notes |
| --- | --- | --- |
| Public homepage and marketing | `www.gwapspot.com` | Indexed |
| Ecosystem, roadmap, community, launch, docs | `www.gwapspot.com` | Indexed |
| GWAP OS entry | `app.gwapspot.com` | App-only |
| Sign-in / session refresh | `app.gwapspot.com` | App-only |
| `/app/**` | `app.gwapspot.com` | Authenticated, noindex |
| API routes | Shared repository | Treat as backend/shared infrastructure |

## Vercel

Production is intentionally split across two Vercel projects connected to this repository:

1. **gwapspot-web** → `gwapspot.com`, `www.gwapspot.com`
2. **gwapspot-app** → `app.gwapspot.com`

This gives the public gateway and GWAP OS independent production deployments, runtime logs, and rollback history while preserving shared source code.

## Repository hygiene

Keep durable product documentation under `docs/`. Temporary audit notes, one-off acceptance notes, generated output, and agent scratch files should not live at the repository root.

Current durable references include authentication, GWAP OS architecture, browser behavior, developer billing, reputation snapshots, PPV receipts, domain separation, and production operations.
