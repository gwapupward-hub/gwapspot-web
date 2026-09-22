# GWAPSpot Operational Status

Last reviewed: 2026-09-22

## Production surfaces

| Surface | Status | Deployment ownership | Notes |
| --- | --- | --- | --- |
| `gwapspot.com` / `www.gwapspot.com` | Active | `gwapspot-web` | Public website and discovery layer |
| `app.gwapspot.com` | Active | `gwapspot-app` | Dedicated GWAP OS deployment |
| `/app/**` | Active | `gwapspot-app` canonical host | Authenticated GWAP OS |
| Shared APIs | Active | Shared source repository | Backend/shared infrastructure |

## Verified working

- Vercel has separate `gwapspot-web` and `gwapspot-app` projects.
- `app.gwapspot.com` resolves to the `gwapspot-app` production deployment.
- `www.gwapspot.com` resolves to the `gwapspot-web` production deployment.
- `app.gwapspot.com/` resolves to the OS entry surface.
- `app.gwapspot.com/app` resolves to GWAP OS and remains `noindex`.
- Marketing routes requested on the app host normalize to the app entry.
- Bare `gwapspot.com` permanently redirects to `www.gwapspot.com`.
- No GWAP app runtime error groups were present during the 2026-09-22 verification window.

## Canonicalization being locked in

This branch permanently redirects app-owned routes requested on either public host to `app.gwapspot.com`.

That removes the remaining ambiguity where `www.gwapspot.com/app` could still render an OS sign-in route from the public project.

## Still shared by design

- Git repository
- shared components
- shared API code
- static assets
- some environment configuration until it is fully narrowed per Vercel project

## Current operational caution

Because both Vercel projects are connected to the same Git repository, feature branches can generate previews in both projects. This is expected with the current Git integration, but it can create duplicate preview noise. Treat preview-build filtering as a separate optimization after the canonical domain routing is stable.
