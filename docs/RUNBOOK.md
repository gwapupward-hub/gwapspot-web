# GWAPSpot Incident Runbook

This is the short operational playbook for incidents affecting `gwapspot-web`, its Vercel deployments, Privy authentication, workspace storage, or PPV integrations.

## Priorities

Handle incidents in this order:

1. Protect user funds, authentication, secrets, and production data.
2. Stop or isolate the affected write path.
3. Restore the last known-good user experience.
4. Preserve enough evidence to understand the root cause.
5. Verify the actual user flow before declaring recovery.

Do not paste secrets, Redis URLs, private RPC credentials, signing keys, or Privy app secrets into GitHub issues, pull requests, chat, screenshots, or logs.

## Ownership

| Area | Primary owner | First responsibility |
| --- | --- | --- |
| Production decision / user communication | Founder / authorized operator | Decide whether to disable a feature, roll back, or communicate externally |
| Vercel deployments and environment variables | Deployment operator | Roll back, redeploy, verify project/domain mapping and environment scope |
| Privy authentication | Auth operator | Keep production and development Privy apps isolated; rotate exposed credentials |
| Redis / Upstash | Infrastructure operator | Keep dev and production databases isolated; restore storage availability |
| PPV / Solana | PPV operator | Disable risky write paths, verify cluster/program readiness, test devnet transactions |
| Code fix | Engineer handling incident | Reproduce, make the smallest safe fix, add a regression check, open a focused PR |

One person may fill multiple roles. The role still needs to be explicit during an incident.

## Severity

### P0 — stop the affected write path now

Examples:

- suspected credential or signing-key exposure;
- unauthorized authentication/session behavior;
- production data corruption;
- incorrect Solana cluster or program used for a value-bearing write;
- PPV custody or real-value behavior enabled unexpectedly.

### P1 — restore quickly

Examples:

- production login unavailable;
- production deployment broken;
- Redis unavailable and GWAP OS workspace locked;
- PPV Core/Commerce devnet transactions failing after a dependency or deployment change.

### P2 — degraded but safe

Examples:

- analytics/reporting unavailable;
- non-critical page or background job failure;
- preview/dev-only failure with production unaffected.

## First 10 minutes

1. Record the UTC time, affected hostname, current Git commit, Vercel deployment, and the first confirmed symptom.
2. Confirm whether the problem is production, devnet, preview, or more than one environment.
3. If a risky write path is involved, disable only that path first. Do not broaden the outage without evidence.
4. Preserve relevant Vercel logs, GitHub Actions run IDs, transaction signatures, and error messages. Do not copy secrets.
5. Decide between rollback and forward fix. Prefer rollback when a recent deployment clearly introduced the incident.
6. After any recovery action, test the user journey end to end. A green build alone is not recovery.

## Vercel rollback

GWAPSpot uses two production Vercel projects from this repository:

- `gwapspot-app` → `app.gwapspot.com`
- `gwapspot-web` → `gwapspot.com` and `www.gwapspot.com`

Only roll back the project that is affected unless evidence shows both need to move together.

### Procedure

1. In Vercel, identify the current production deployment and its Git commit.
2. Identify the last known-good deployment for the affected project.
3. Promote/rollback to that known-good deployment using Vercel's production deployment controls.
4. Confirm the custom domain points to the intended deployment.
5. Verify:
   - the affected route loads;
   - `/api/health` responds where applicable;
   - sign-in/session refresh works if auth is involved;
   - the affected state-changing workflow works in the correct environment.
6. Record the deployment and commit used for recovery.

Do not assume a redeploy contains the intended Git revision. Verify the commit attached to the deployment.

## Privy credential incident

Production and development use separate Privy applications. Never mix an app ID, client ID, or app secret between them.

If a Privy secret is suspected exposed:

1. Identify whether the exposed credential belongs to production or development.
2. Rotate/revoke it in the matching Privy application.
3. Update only the matching Vercel project's server-side environment value.
4. Confirm `NEXT_PUBLIC_PRIVY_APP_ID`, optional `NEXT_PUBLIC_PRIVY_CLIENT_ID`, and `PRIVY_APP_SECRET` all belong to the same Privy application.
5. Redeploy the affected environment.
6. Smoke test:
   - email OTP login;
   - Solana wallet login;
   - authenticated `/app` access;
   - refresh/session recovery;
   - sign-out and reconnect.

Never put `PRIVY_APP_SECRET` in a `NEXT_PUBLIC_` variable.

## Redis / Upstash isolation and recovery

Development must never use the production Redis/Upstash database.

Supported storage configuration, in precedence order:

1. `REDIS_URL` when explicitly configured;
2. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`;
3. `KV_REST_API_URL` + `KV_REST_API_TOKEN`.

A URL/token pair must come from the same database.

### Dev storage failure

1. Create or select a dedicated development Redis/Upstash database.
2. Add its credentials only to the `gwapspot-dev` Vercel project/environment.
3. Redeploy dev.
4. Confirm `/api/health` reports a configured storage source without exposing credentials.
5. Sign in on `dev.gwapspot.com`, write a harmless workspace preference/state change, reload, and verify it persists.
6. Confirm production data was not touched.

If storage credentials are suspected exposed, rotate them before restoring service.

## PPV emergency controls

PPV write capability is controlled by explicit environment gates. When the problem is uncertain, disable the narrowest risky layer first and widen only if needed.

Relevant switches:

```text
PPV_ENABLED
PPV_CORE_ENABLED
PPV_COMMERCE_ENABLED
PPV_COMMERCE_INBOX_ENABLED
PPV_ESCROW_ENABLED
PPV_MAINNET_ENABLED
PPV_ESCROW_REAL_VALUE
PPV_CUSTODY_GATE
```

For a custody/funds concern, the safe state is:

```text
PPV_ESCROW_ENABLED=false
PPV_MAINNET_ENABLED=false
PPV_ESCROW_REAL_VALUE=false
PPV_CUSTODY_GATE=CLOSED
```

For a Commerce write-path incident, set `PPV_COMMERCE_ENABLED=false`. If the incident may affect all PPV writes, set `PPV_ENABLED=false`.

Do not enable mainnet or real-value flags as a recovery shortcut.

After changing a PPV gate:

1. redeploy the affected environment;
2. check `/api/ppv/readiness`;
3. confirm the UI reflects the disabled capability;
4. test the intended devnet flow before re-enabling writes.

## Required auth + PPV smoke test after dependency upgrades

Run this after upgrades to Privy, `@solana/kit`, `@solana/web3.js`, or `@solana-program/*`.

### Production authentication

- Email OTP signs in and returns to GWAP OS.
- A Solana Wallet Standard wallet signs in successfully.
- Refresh keeps a valid session.
- Sign-out clears access and reconnect works.

### Devnet transaction path

On `dev.gwapspot.com`:

- confirm the DEVNET runtime is visible;
- confirm the development Privy application is used;
- check `/api/ppv/readiness`;
- create/confirm a PPV Core proof on devnet when Core is enabled;
- prepare/confirm a PPV Commerce transaction when Commerce is enabled;
- verify the resulting transaction signature and application state;
- keep Escrow and real-value custody disabled unless their separate release gates are explicitly approved.

A successful build does not substitute for this transaction smoke test.

## CSP report-only incidents

CSP is introduced in report-only mode before enforcement.

- Reports arrive at `/api/csp-report` and are logged with the `[csp-report]` prefix.
- Report-only violations do not block the browser.
- Review repeated violations by directive and hostname.
- Add an origin only when a real product dependency requires it.
- Do not move the policy to enforcement until Privy sign-in, Solana RPC, Telegram, Vercel Analytics/Speed Insights, and the major public routes have been exercised without unexplained violations.

## Vercel dashboard checks

Review these after an incident and during release hardening:

- Deployment Protection for `dev.gwapspot.com`;
- WAF/custom firewall rules and rate limiting;
- bot protection where appropriate;
- function/runtime logs and a log drain if operational retention is required;
- spend/usage alerts and budget thresholds;
- environment-variable scope between Production, Preview, and Development.

These are dashboard controls, not source-code settings. Record any manual change in the incident note.

## Recovery verification

Before closing an incident, record PASS/FAIL for the applicable items:

- Production page load
- `/api/health`
- Email login
- Solana wallet login
- Session refresh/logout
- Redis workspace read/write
- PPV readiness
- PPV devnet Core transaction
- PPV devnet Commerce transaction
- Vercel logs clean of the original error
- No unexpected CSP violations for the recovered flow

## Incident note template

```text
STARTED (UTC):
SEVERITY:
AFFECTED HOST/ENV:
CURRENT COMMIT:
DEPLOYMENT:
SYMPTOM:
USER IMPACT:
WRITE PATH DISABLED:
ROOT CAUSE:
RECOVERY ACTION:
VERIFICATION:
CREDENTIALS ROTATED: yes/no/not required
REMAINING RISK:
FOLLOW-UP PR/ISSUE:
CLOSED (UTC):
```

Use confirmed facts in external communication. Do not speculate about cause, scope, or user impact.
