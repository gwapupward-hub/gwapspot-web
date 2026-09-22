# GWAPSpot Domain Separation

## Goal

Make the public website and GWAP OS behave like separate products even while they share source code.

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

Allowed browser routes:

- `/`
- `/os-entry`
- `/os-sign-in`
- `/refresh`
- `/sign-in` only as a normalization path
- `/app`
- `/app/**`

Unknown or marketing routes on this host must redirect to `/`.

## Deployment model

Preferred production model:

| Vercel project | Production domain | Responsibility |
| --- | --- | --- |
| `gwapspot-web` | `www.gwapspot.com` | Public website |
| `gwapspot-app` | `app.gwapspot.com` | GWAP OS |

Both projects may point to the same Git repository at first. This is safer than immediately splitting repositories because shared components, API code, authentication, and assets can continue to evolve together while deployment and observability are separated.

## Environment boundaries

Public-web project should only receive variables required by public pages and shared public APIs.

App project should receive authentication, workspace storage, wallet, GNS, PPV/devnet, billing, and other OS-only secrets/config.

Never expose a server secret as a `NEXT_PUBLIC_*` variable.

## Verification checklist

Public host:

- `https://www.gwapspot.com/` loads public homepage.
- Public SEO metadata points to `www.gwapspot.com`.
- `/app` should direct users into the canonical app host once the dual-project deployment is active.

App host:

- `https://app.gwapspot.com/` loads the OS entry surface.
- `/app/**` remains authenticated.
- Marketing routes do not render on the app host.
- App pages remain `noindex`.
- Auth/session loops remain guarded.

Operational:

- Each Vercel project has independent production deployment history.
- Each project has only its required env variables.
- Production aliases point to exactly one project each.
- Preview deployments can be verified independently.

## Migration order

1. Keep current host-routing behavior intact.
2. Create `gwapspot-app` Vercel project from this repo.
3. Copy only app-required environment variables.
4. Attach `app.gwapspot.com` to the app project.
5. Keep `www.gwapspot.com` on `gwapspot-web`.
6. Verify both production hosts.
7. Add cross-host canonical redirects where required.
8. Only after stable operation consider physically extracting app/public code into separate packages or repositories.
