# GWAPSpot Web

One Next.js codebase currently serves two intentionally separate product surfaces:

- **https://www.gwapspot.com** — public GWAP website, discovery, ecosystem pages, docs, launch pages, community, public proof surfaces, and downloadable assets.
- **https://app.gwapspot.com** — authenticated GWAP OS application surface.

## Architecture

The split is host-based.

- `www.gwapspot.com` owns public/marketing routes.
- `app.gwapspot.com` owns `/`, `/os-entry`, `/os-sign-in`, `/refresh`, and `/app/**`.
- Requests for public marketing routes on `app.gwapspot.com` are redirected back to the app entry.
- The authenticated OS remains non-indexable.
- Shared API routes and shared assets still live in this repository for now.

The routing contract is implemented in:

- `app/lib/app-domain-routing.ts`
- `app/lib/proxy-routing.ts`
- `proxy.ts`

Do not add new app-host routes without updating the allowlist and its tests.

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
| API routes | Shared project for now | Treat as backend/shared infrastructure |

## Vercel

The repository currently deploys through the Vercel project `gwapspot-web`.

For the cleanest operational separation, use **two Vercel projects connected to this repository**:

1. **gwapspot-web** → `www.gwapspot.com`
2. **gwapspot-app** → `app.gwapspot.com`

Keep the same Git source initially, but configure each project with its own production domain and environment variables. This gives each surface independent deployments, logs, rollback history, and ownership without forcing an immediate source-code split.

Until the second Vercel project exists, the host-routing layer in this repo keeps the two surfaces logically isolated inside the current deployment.

## Repository hygiene

Keep durable product documentation under `docs/`. Temporary audit notes, one-off acceptance notes, generated output, and agent scratch files should not live at the repository root.

Current durable references include authentication, GWAP OS architecture, browser behavior, developer billing, reputation snapshots, PPV receipts, and production operations.
