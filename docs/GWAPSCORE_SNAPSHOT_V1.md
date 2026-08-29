# GwapScore Snapshot v1

Snapshot v1 is the evidence layer beneath GwapScore. GWAP Public Proof answers
*"does this person control this account?"*. Snapshots answer *"what has this
account demonstrated over time?"*.

**Snapshot v1 does not calculate, change, or influence any GwapScore.** It
collects longitudinal evidence so a later social model can be designed against
real distributions rather than guesses. Scoring weights are deliberately not
decided here.

## Product role

- **Proof of Control** (`social-proof-control.ts`) establishes that an X account
  belongs to a GWAP account, binding the stable X `author_id`.
- **Snapshot v1** (`gwapscore-snapshot-core.ts`, `gwapscore-snapshots.ts`,
  `x-social-snapshot-source.ts`) observes that verified account on a schedule and
  persists an append-only series of raw public observations.
- **GwapScore** remains the wallet reputation signal and is untouched.
- **Trust Graph** still explains evidence coverage; no weight changes here.

Only verified accounts are ever observed. Revoking a verification stops
collection, and the collector re-checks the verification record before every
read, so an expired or rebound verification removes the account from collection
automatically.

## Cadence and scheduling

- One snapshot per verified account every **24 hours**.
- Engagement is summed over a rolling **168-hour (7 day)** window.
- The registry is a single locked document (`gwapscore-snapshot-registry`)
  holding one subject per verified account, following the Daily Ideas delivery
  registry pattern. Workspace storage exposes no list or scan commands, so
  enumeration requires this explicit registry.
- `claimDueSnapshotSubjects` advances a subject's slot in the same locked write
  that claims it, so two concurrent collector runs cannot observe one slot twice.
- A failed read retries after one hour, at most three times, before falling back
  to the normal cadence.

## Retained raw observations

Each row is `SocialSnapshot`, `schemaVersion: 1`, written once and never
rewritten:

| Field | Meaning |
| --- | --- |
| `snapshotId` | `snap_` + sha256(`accountId:platform:scheduledFor`). Idempotency key: a retried run for the same slot cannot append twice. |
| `accountId` / `platform` | Canonical GWAP account and social platform. |
| `externalAccountId` | Stable X `author_id`. The binding is the account id, never the handle. |
| `socialHandle` | Handle observed at collection time. Handles drift; this records the drift. |
| `collectedAt` | When collection actually ran. |
| `scheduledFor` | The cadence slot this row satisfies. |
| `source` | `{ provider: "x-api-v2", endpoints }` — which endpoints actually answered. |
| `provenance` | Verification method, `verifiedAt`, and the challenge code that established control. |
| `metrics` | Nine metric values (below). |
| `window` | Engagement window hours, post count, oldest and newest post timestamps. |
| `collection` | `ok` / `partial` / `failed`, plus the X diagnostic when one applies. |

## Metrics

`followers`, `following`, `lifetimePosts`, `recentPosts`, `likes`, `replies`,
`reposts`, `quotes`, `impressions`.

Every metric is a tagged union, never a bare number:

```ts
type MetricValue =
  | { state: "observed"; value: number }
  | { state: "unavailable"; reason: "not_authorized" | "not_returned" | "rate_limited" | "source_error" | "no_posts_in_window" };
```

### Unavailable is never zero

This is the load-bearing rule of the schema. A metric GWAP could not read is
recorded as `unavailable` with a reason. It is never written as `0`, never
omitted, and never interpolated. A later score model must be able to tell
*"this account has no reach"* from *"GWAP could not see this account's reach"* —
collapsing the two would let an API outage read as bad reputation.

Consequences held throughout:

- `impressions` is always `{ state: "unavailable", reason: "not_authorized" }`.
  Impressions are non-public metrics requiring OAuth 2.0 user context; the
  app-only bearer cannot read them. The gap is recorded deliberately so it is
  visible in the series rather than absent from it.
- An account that was readable but posted nothing in the window records
  `recentPosts` as an observed `0` and engagement as
  `unavailable: "no_posts_in_window"` — there is no denominator to measure.
- A failed collection still writes a row, with every affected metric marked
  unavailable. Silence would be indistinguishable from an unobserved account.
- `deriveSnapshotSeries` skips unavailable points entirely, and reports `delta:
  null` unless two real observations exist.

## Retention

- Rolling **180 snapshots** per account (~6 months at 24h cadence), oldest tail
  dropped at the cap. History is one JSON document per account, so the cap also
  bounds document size.
- **365-day TTL**, refreshed on every write.
- Rows are append-only. The cap removes old rows; it never edits them.

## API surface

Account-scoped only in v1. There is no public and no B2B snapshot surface.

- `GET /api/gwapscore/snapshots` — Privy wallet auth, returns only the caller's
  own subject, latest snapshot, paged history, and derived series.
- `GET|POST /api/gwapscore/snapshots/collect` — the worker. Authorized by a
  timing-safe bearer match against `CRON_SECRET` (Vercel Cron) or
  `GWAPSCORE_SNAPSHOT_WORKER_KEY` (manual and backfill runs). The `x-vercel-cron`
  header is not a secret and is never accepted on its own.

## Configuration

| Variable | Purpose |
| --- | --- |
| `GWAPSCORE_SNAPSHOTS_ENABLED` | Collection kill switch. When not `true`, the collector returns `enabled: false` without touching the X API. |
| `GWAPSCORE_X_BEARER_TOKEN` | Shared with Public Proof. Without it, collection is disabled. |
| `GWAPSCORE_SNAPSHOT_WORKER_KEY` | Manual/backfill worker key. Minimum 32 characters. |
| `CRON_SECRET` | Vercel Cron bearer. Minimum 32 characters. |

The cron entry lives in `vercel.json` and runs daily at 04:00 UTC.

## Not in this phase

No score model, no weights, no confidence calculation, no evidence-window
policy, no score history, no score deltas. Those are designed once several real
accounts have accumulated repeated snapshots and the actual distributions are
observable.
