# GWAPSpot Operational Status

Last reviewed: 2026-09-22

## Production surfaces

| Surface | Status | Deployment ownership | Notes |
| --- | --- | --- | --- |
| `www.gwapspot.com` | Active | `gwapspot-web` | Public website and discovery layer |
| `app.gwapspot.com` | Logically separated in code | Still shares `gwapspot-web` deployment | Dedicated Vercel project still recommended |
| `/app/**` | Active | Shared project | Authenticated GWAP OS |
| Shared APIs | Active | Shared project | Backend/shared infrastructure |

## What is working

- Next.js host detection recognizes `app.gwapspot.com`.
- App-host `/` rewrites to the OS entry surface.
- Unknown/marketing routes on the app host redirect to the app entry.
- `/app/**` remains session-gated.
- GWAP OS metadata is `noindex`.
- Public metadata remains canonical to `www.gwapspot.com`.
- Vercel production deployment for `gwapspot-web` is currently READY.
- Preview deployment for PR #191 is READY.

## What is still mixed

- Public website and GWAP OS deploy from the same Vercel project.
- Production logs and rollback history are shared.
- Environment variables are project-wide instead of surface-specific.
- API routes are shared by both surfaces.
- A failure in one deployment can still affect both public and app hosts.

## Next operational move

Create a second Vercel project named `gwapspot-app`, connect it to this repository, and assign `app.gwapspot.com` to it.

Do not split the Git repository yet. First separate deployment ownership and environment configuration, verify both hosts, then decide whether a source-level monorepo split is worth the added complexity.
