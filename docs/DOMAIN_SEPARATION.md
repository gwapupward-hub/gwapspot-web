# GWAPSpot Domain Separation

## Goal

Keep the public GWAP website and GWAP OS operationally separate while they continue sharing one source repository.

## Canonical ownership

### www.gwapspot.com

Public, indexable website.

Expected content:

- homepage
- ecosystem
- docs
- launch
- developers
- about
- roadmap
- community
- contact
- changelog
- public proof pages
- GwapMojis/public download pages

### app.gwapspot.com

Private application host.

App-owned browser routes:

- `/`
- `/os-entry`
- `/os-sign-in`
- `/refresh`
- `/sign-in`
- `/app`
- `/app/**`

Unknown or marketing routes on this host must normalize to the app entry.

## Deployment model

| Vercel project | Production domain | Responsibility |
| --- | --- | --- |
| `gwapspot-web` | `gwapspot.com`, `www.gwapspot.com` | Public website |
| `gwapspot-app` | `app.gwapspot.com` | GWAP OS |

Both projects point to this repository. That preserves shared components and APIs while giving each production surface independent deployments, logs, and rollback history.

## Canonical redirect contract

Public hosts must never remain the canonical location for app-owned routes.

Requests for these paths on `gwapspot.com` or `www.gwapspot.com` permanently redirect to the same path on `app.gwapspot.com`:

- `/app`
- `/app/**`
- `/sign-in`
- `/sign-in/**`
- `/refresh`
- `/os-entry`
- `/os-entry/**`
- `/os-sign-in`
- `/os-sign-in/**`

All other requests to bare `gwapspot.com` canonicalize to `www.gwapspot.com`.

## Environment boundaries

The public-web project should only receive variables required by public pages and shared public APIs.

The app project should receive authentication, workspace storage, wallet, GNS, PPV/devnet, billing, and other OS-only configuration.

Never expose a server secret as a `NEXT_PUBLIC_*` variable.

## Verification checklist

Public host:

- `https://www.gwapspot.com/` loads the public homepage.
- Public SEO metadata points to `www.gwapspot.com`.
- `/app` and app-owned deep links 308 to `app.gwapspot.com`.

App host:

- `https://app.gwapspot.com/` loads the OS entry surface.
- `/app/**` remains authenticated.
- Marketing routes do not render on the app host.
- App pages remain `noindex`.
- Auth/session loops remain guarded.

Operational:

- Each Vercel project has independent production deployment history.
- Production custom domains resolve to their intended project.
- Runtime errors can be inspected independently.
- Preview deployments are verified per project.

## Future separation

Do not split the Git repository merely because the Vercel projects are separate. Consider a source-level monorepo or repository split only when public and app code ownership, dependencies, or release cadence become materially independent.
