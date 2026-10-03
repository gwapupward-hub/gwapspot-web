<p align="center">
  <a href="https://www.gwapspot.com">
    <img src=".github/assets/social-preview.png" alt="GWAP crown and wordmark on a neon-green background" width="720">
  </a>
</p>

<h1 align="center">GWAPSpot Web</h1>

<p align="center">
  <strong>GWAP — Grind With A Purpose.</strong> Identity + reputation, connected.
</p>

<p align="center">
  <a href="https://github.com/gwapupward-hub/gwapspot-web/actions/workflows/quality.yml"><img src="https://github.com/gwapupward-hub/gwapspot-web/actions/workflows/quality.yml/badge.svg?branch=main" alt="Quality"></a>
  <a href="https://github.com/gwapupward-hub/gwapspot-web/actions/workflows/security.yml"><img src="https://github.com/gwapupward-hub/gwapspot-web/actions/workflows/security.yml/badge.svg?branch=main" alt="Security Baseline"></a>
</p>

<p align="center">
  <a href="https://www.gwapspot.com">Website</a> ·
  <a href="https://app.gwapspot.com">GWAP OS app</a> ·
  <a href="https://www.gwapspot.com/docs">Docs</a> ·
  <a href="SECURITY.md">Security policy</a>
</p>

## What is GWAPSpot?

GWAP connects identity and reputation for Solana wallets and carries that trust across the GWAP network.

- **.gwap identity** — turn a Solana wallet into a portable `.gwap` identity.
- **GwapScore** — understand a wallet's reputation.
- **GWAP OS** — the authenticated app at `app.gwapspot.com` that connects identity, proof, reputation, and activity in one place.
- **Public website** — `www.gwapspot.com`, the discovery layer for the ecosystem, roadmap, community, and docs.

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, Privy authentication, and Solana.

## Local development

Prerequisites: Node.js 24 (the version CI uses) and npm.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Every variable is documented inline in [`.env.example`](.env.example). You only need a few of them locally:

| Goal | Variables | Notes |
| --- | --- | --- |
| Run the public site | None | The copied `.env.example` defaults (or no `.env.local` at all) are enough. |
| Use GWAP OS (`/app`) | `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Use a **development** Privy app, never production. See [Authentication setup](docs/AUTHENTICATION_SETUP.md). |
| | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `REDIS_URL`, or `KV_REST_API_URL` + `KV_REST_API_TOKEN`) | Workspace storage. GWAP OS needs both Privy and storage. Use a non-production database. |
| Avoid public RPC rate limits | `SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL` | Server-side and browser Solana RPC endpoints. |
| Test against devnet | `GWAP_OS_RUNTIME_MODE=devnet` | Only applies to localhost/preview hosts. |

Integrations such as Gwap Browser, GwapScore snapshots, Public Proof, PPV, developer billing, and Telegram/Daily Ideas are **off by default** behind explicit switches. Leave them off unless you are working on that feature; each section of `.env.example` explains what it needs.

Never put secrets in `NEXT_PUBLIC_*` variables, and never commit `.env.local` (it is ignored by `.gitignore`).

## Validation

Before merging:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/app` shows "Wallet access is ready for activation" | GWAP OS isn't configured. Open `http://localhost:3000/api/health`. `missing_privy_configuration` means the Privy variables are unset; `missing_workspace_storage` means no storage variables are set; `workspace_storage_unreachable` means storage is configured but cannot be reached. |
| Privy rejects sign-in even though variables are set | The app ID, app secret, and optional client ID must all come from the **same** Privy app. Don't mix development and production values. |
| `npm ci` fails on peer dependencies | Use npm (not yarn or pnpm) so the committed `package-lock.json` and `.npmrc` (`legacy-peer-deps=true`) apply. |
| `npm test` fails with a bad option or TypeScript syntax errors | Your Node.js is too old for `--experimental-strip-types`. Use Node.js 24. |
| `npm run build` fails with `Invalid splash data` | The `prebuild` step (`scripts/generate-splash.mjs`) could not decode `app/components/splash-data/`. Restore those files from `main`. |
| Solana requests fail with rate-limit errors | The public Solana RPC is rate limited. Set `SOLANA_RPC_URL` (server) and `NEXT_PUBLIC_SOLANA_RPC_URL` (browser) to a dedicated endpoint. |

## Architecture

One Next.js codebase serves two production surfaces with separate Vercel projects:

- **https://www.gwapspot.com** — public GWAP website and discovery layer.
- **https://app.gwapspot.com** — authenticated GWAP OS application surface.

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

## Documentation

| Document | Covers |
| --- | --- |
| [GWAP MASTER](docs/master/README.md) | Cross-system architecture, source authority, and decision evidence |
| [Operational status](docs/STATUS.md) | Current state of each production surface |
| [Incident runbook](docs/RUNBOOK.md) | Production incident playbook |
| [Production checklist](docs/production-checklist.md) | Release verification |
| [Authentication setup](docs/AUTHENTICATION_SETUP.md) | Privy, wallet and email sign-in, devnet/production separation |
| [Domain separation](docs/DOMAIN_SEPARATION.md) | Public site vs. GWAP OS host split |
| [Vercel deployment topology](docs/VERCEL_DEPLOYMENT_TOPOLOGY.md) | Split-project deployment policy |
| [GWAP OS v1](docs/GWAP_OS_V1.md) · [UX architecture](docs/GWAP_OS_UX_ARCHITECTURE.md) | GWAP OS runtime and product direction |
| [Gwap Browser V1](docs/GWAP_BROWSER_V1.md) | Browser architecture and operations |
| [Developer billing](docs/GWAP_DEVELOPER_BILLING.md) · [Intelligence API](docs/GWAP_INTELLIGENCE_API.md) | Developer API and billing |
| [GwapScore snapshots](docs/GWAPSCORE_SNAPSHOT_V1.md) · [Public Proof](docs/GWAP_PUBLIC_PROOF.md) | Reputation evidence and Proof-of-Control |
| [PPV reputation receipts](docs/PPV_REPUTATION_RECEIPTS.md) · [PPV Commerce localnet](docs/PPV_COMMERCE_LOCALNET.md) | PPV pipeline and acceptance |

## Repository hygiene

Keep durable product documentation under `docs/`. Temporary audit notes, one-off acceptance notes, generated output, and agent scratch files should not live at the repository root.

## License

Proprietary. Copyright © GWAPSpot. All rights reserved.

The source is public for transparency. No license is granted to copy, modify, or distribute it. To report a vulnerability, follow the [security policy](SECURITY.md).
