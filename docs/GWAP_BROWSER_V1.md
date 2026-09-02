# Gwap Browser V1 — Architecture and Operations

Status: In Development (feature-flagged off by default). Beta only after every
release gate in the implementation handoff passes.

Gwap Browser is the discovery and resolution layer for projects published
from Daily Ideas 2.0 workspaces. It is an authenticated GwapOS surface at
`/app/browser` on `app.gwapspot.com`. It is **not** a replacement for Safari,
Chrome, Phantom, or Jupiter, and it does not make `.gwap` resolvable in an
ordinary browser address bar — `.gwap` is not a public DNS TLD. Resolution
happens only inside the Gwap Browser input.

## Product loop

```
Daily Ideas → Workspace → Build → Connect Deployment → Publish to .gwap
    → Resolve and discover in Gwap Browser → Open the live project
```

## Address grammar (locked to current GNS rules)

| Address                 | Resolves to                                          |
| ----------------------- | ---------------------------------------------------- |
| `owner.gwap`            | GNS profile by default, or the owner's primary project |
| `profile.owner.gwap`    | Always the GNS profile (escape hatch)                |
| `project.owner.gwap`    | The canonical published project                      |

- Owner names: lowercase letters, digits, internal hyphens, 1–32 chars.
- Project slugs: same character rules, 1–48 chars.
- Nested routes (`a.b.owner.gwap`) are rejected.
- Reserved slugs live in one place: `RESERVED_PROJECT_SLUGS` in
  `app/lib/gwap-browser-core.ts`.

## Visibility truth table

| Visibility | Exact resolve | Keyword discovery | Stored where          |
| ---------- | ------------- | ----------------- | --------------------- |
| Public     | Yes           | Yes               | Registry              |
| Unlisted   | Yes           | No                | Registry              |
| Private    | No            | No                | Private draft only    |
| Suspended  | No            | No                | Registry (kept for republish) |
| Unpublished| No            | No                | Removed from registry; draft kept |

## Modules

| File | Role |
| ---- | ---- |
| `app/lib/gwap-browser-core.ts` | Pure: address parsing, query classification, URL policy, validation, IDs, hashes, visibility rules, primary-route resolution, deterministic search, public projection, flag parsing |
| `app/lib/gwap-browser-ownership.ts` | Pure: live GNS ownership verification and TTL revalidation over an injected resolver |
| `app/lib/gwap-browser-registry.ts` | Bounded registry document (publications + owner routes), private drafts, publish/unpublish/suspend/refresh/owner-route mutations under `withWorkspaceLock` |
| `app/lib/daily-ideas-workspace-deployment.ts` | Per-workspace deployment connection record |
| `app/lib/gwap-browser-server.ts` | Server-only wiring: feature flags, live GNS resolver, publisher ownership, exact resolution with revalidation, public-safe JSON + IP rate limiting |

## APIs

Workspace (authenticated, membership + capability enforced, `no-store`):

```
GET    /api/daily-ideas/workspaces/[projectId]/deployment          deployment:read
PUT    /api/daily-ideas/workspaces/[projectId]/deployment          deployment:manage (Owner, Developer) + origin
DELETE /api/daily-ideas/workspaces/[projectId]/deployment          Owner + origin; blocked while published
GET    /api/daily-ideas/workspaces/[projectId]/publication         publication:read
PUT    /api/daily-ideas/workspaces/[projectId]/publication         publication:manage (Owner) + origin
POST   /api/daily-ideas/workspaces/[projectId]/publication/publish   Owner + origin + live GNS ownership; idempotent
POST   /api/daily-ideas/workspaces/[projectId]/publication/unpublish Owner + origin; idempotent; resets primary route
PUT    /api/gwap-browser/owner-route                               authenticated + live GNS ownership + publication ownership
```

Browser (public-safe, IP rate limited, only intentional public metadata):

```
GET /api/gwap-browser/resolve?q=store.emerald.gwap
GET /api/gwap-browser/search?q=ai+trading&category=ai&sort=relevance|updated|new&offset=0&limit=20
```

Resolve response kinds: `profile`, `project`, `not_found`,
`temporarily_unavailable`. A `project` response carries the HTTPS target for a
deliberate, user-initiated open. The server never redirects.

Unrelated accounts receive 404 for private workspace resources (existing
anti-enumeration rule).

## Capability matrix

| Role        | Read | Manage deployment | Publish/update/unpublish | Primary `.gwap` route |
| ----------- | ---- | ----------------- | ------------------------ | --------------------- |
| Owner       | Yes  | Yes               | Yes                      | Yes                   |
| Developer   | Yes  | Yes               | No                       | No                    |
| Contributor | Yes  | No                | No                       | No                    |
| Viewer      | Yes  | No                | No                       | No                    |

Capabilities: `deployment:read`, `deployment:manage`, `publication:read`,
`publication:manage` in `app/lib/daily-ideas-workspace-core.ts`.

## GNS ownership model

Publishing authority is the live GNS owner, never a cached field or client
state. On every publish, update, and primary-route change the server:

1. loads the authenticated wallet identity and canonical GWAP account;
2. takes the intended `.gwap` name from the account (or a live identity lookup);
3. calls the existing server-side GNS `/resolve`;
4. requires `found === true` and `owner === verifiedWallet`;
5. fails closed on mismatch or unavailability.

Publications store `ownershipVerifiedAt`. On exact resolution, proof older
than 15 minutes (`GWAP_BROWSER_OWNERSHIP_TTL_MS`) is revalidated live:

- still owned → proof refreshed, project opens;
- transferred or expired → publication **suspended**, removed from discovery,
  primary route reset to Profile;
- GNS unavailable → `temporarily_unavailable`; the target is not opened.

Search results never trigger GNS calls; only exact opens do.

## Deployment URL safety

Accepted: `https:` only, no credentials, public hostname, ≤ 2048 chars, no
control characters, fragment stripped. Rejected: `http:`, `javascript:`,
`data:`, `file:`, `blob:`, protocol-relative, raw IPv4/IPv6, `localhost`,
`.local`/`.internal`/`.localhost`/`.lan`/`.onion`/`.home.arpa`.

The server never fetches the URL (no SSRF surface). "Deployment connected"
means syntax-validated and user-attested — not verified, not monitored.
The UI opens the target only after an explicit user action with
`target="_blank" rel="noopener noreferrer"`; nothing is iframed or proxied.

## Registry storage and caps

One bounded document (`gwap-browser-registry`) because the Redis abstraction
exposes GET/SET/NX/EVAL only. Every read-modify-write runs under
`withWorkspaceLock`; a busy lease returns `409` + `Retry-After` without
writing. Mutations commit the whole document or nothing.

| Cap | Value |
| --- | ----- |
| Total publications | 2,000 (`GWAP_BROWSER_MAX_PUBLICATIONS`) |
| Active publications per owner | 50 (`GWAP_BROWSER_MAX_PUBLICATIONS_PER_OWNER`) |
| Search page size | 24 max |

Corrupt entries are dropped from reads and never coerced into listings. A
dedicated search/database service must replace this document before scale
approaches the cap.

Keys (all under the private hashed keyspace via `workspaceStorageKey`):
`di-workspace-deployment:<workspaceId>`, `gwap-browser-draft:<workspaceId>`,
`gwap-browser-registry:global`, `gwap-browser-registry-lock:global`.

## Feature flags

```
GWAP_BROWSER_ENABLED=false          # /app/browser, resolve/search APIs, deployment connections
GWAP_BROWSER_PUBLISH_ENABLED=false  # additionally allows owners to publish (requires ENABLED)
```

Flags are on only when literally `true`. APIs are the enforcement point; the
UI explains unavailability. Unpublish is never flag-gated so owners can always
withdraw a publication.

## Analytics

High-level events only: `gwap_browser_opened`, `gwap_browser_search_submitted`,
`gwap_browser_exact_resolved`, `gwap_browser_result_opened`,
`gwap_browser_external_project_opened`, `daily_ideas_deployment_connected`,
`daily_ideas_publication_draft_saved`, `daily_ideas_publication_published`,
`daily_ideas_publication_updated`, `daily_ideas_publication_unpublished`,
`gwap_browser_primary_route_changed`. Never raw query text, deployment URLs,
wallets, auth identifiers, invite tokens, source, or terminal data. No
Trending until a documented, manipulation-resistant aggregation exists.

## Rollout

1. Merge only after Quality, preview, and security gates pass.
2. Deploy with `GWAP_BROWSER_ENABLED=true`, publishing still `false`.
3. Verify browse/search/read paths.
4. Set `GWAP_BROWSER_PUBLISH_ENABLED=true` for the controlled beta.
5. Publish one founder-owned test project; verify Public, Unlisted, Primary
   Project, Profile fallback, update, and unpublish.
6. Expand only after real-device checks (Phantom, Jupiter, iPhone WebKit).

## Rollback

- Set both flags to `false`. Drafts and publications stay intact.
- Do not delete user records during rollback.
- Revert the PR only if the flags cannot isolate the issue.
- Invalid primary routes already fall back to Profile at resolve time; an
  explicit reset is `setOwnerRoute(..., { mode: "profile" })`.
- No destructive migration exists for V1.

## Out of scope for V1

Native `.gwap` resolution in browser address bars, extensions, DNS/TLD
infrastructure, GWAP hosting, GitHub import, one-click deploy or provider
credentials, iframe/proxy, screenshot pipeline, AI ranking, Trending, social
features, Marketplace, PPV, on-chain publication metadata, Stripe/Builder
entitlements, public SEO pages, expanded GNS grammar.
