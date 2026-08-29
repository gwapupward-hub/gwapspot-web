import { NextResponse } from "next/server";
import { isValidInternalApiKey } from "../../../../lib/daily-ideas-telegram-account-core";
import {
  SNAPSHOT_CADENCE_HOURS,
  SNAPSHOT_SCHEMA_VERSION,
  snapshotIdFor,
  type SocialSnapshot,
} from "../../../../lib/gwapscore-snapshot-core";
import {
  claimDueSnapshotSubjects,
  recordSnapshot,
  recordSnapshotOutcome,
  snapshotCollectionEnabled,
  unregisterSnapshotSubject,
} from "../../../../lib/gwapscore-snapshots";
import { getSocialVerification } from "../../../../lib/social-proof-control";
import { collectXSnapshotObservation } from "../../../../lib/x-social-snapshot-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BATCH = 10;
const MAX_BATCH = 25;

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: responseHeaders });
}

function requestIdFrom(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
}

/**
 * Vercel Cron presents its own bearer (CRON_SECRET); the worker key covers
 * manual and backfill runs. The x-vercel-cron header is not a secret and is
 * deliberately never accepted on its own.
 */
function authorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return (
    isValidInternalApiKey(authorization, process.env.CRON_SECRET) ||
    isValidInternalApiKey(authorization, process.env.GWAPSCORE_SNAPSHOT_WORKER_KEY)
  );
}

function batchSizeFrom(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("limit"));
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.floor(requested));
}

async function collect(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);

  if (!snapshotCollectionEnabled()) {
    return json({ requestId, enabled: false, claimed: 0, results: [] });
  }

  try {
    const now = new Date();
    const subjects = await claimDueSnapshotSubjects(now, batchSizeFrom(request));
    const results: Array<{ status: string; diagnostic: string | null; stored: boolean }> = [];

    for (const subject of subjects) {
      // Verification records carry their own TTL and can be revoked or rebound
      // to a different X account. Re-check before every read so the registry
      // self-heals rather than observing an account GWAP no longer verifies.
      const verification = await getSocialVerification(subject.accountId, subject.platform);
      if (
        verification?.status !== "verified" ||
        verification.externalAccountId !== subject.externalAccountId
      ) {
        await unregisterSnapshotSubject(subject.accountId, subject.platform).catch(() => false);
        results.push({ status: "skipped", diagnostic: null, stored: false });
        continue;
      }

      const observation = await collectXSnapshotObservation({
        externalAccountId: subject.externalAccountId,
      });
      const collectedAt = new Date().toISOString();
      const snapshot: SocialSnapshot = {
        snapshotId: snapshotIdFor(subject.accountId, subject.platform, subject.scheduledFor),
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        accountId: subject.accountId,
        platform: "x",
        externalAccountId: subject.externalAccountId,
        socialHandle: observation.socialHandle || subject.socialHandle,
        collectedAt,
        scheduledFor: subject.scheduledFor,
        cadenceHours: SNAPSHOT_CADENCE_HOURS,
        source: { provider: "x-api-v2", endpoints: observation.endpoints },
        provenance: {
          verificationMethod: "public-post",
          verifiedAt: subject.verifiedAt,
          challengeCode: subject.challengeCode,
        },
        metrics: observation.metrics,
        window: observation.window,
        collection: { status: observation.status, diagnostic: observation.diagnostic },
      };

      // An unreadable account is still recorded, as an explicitly unobserved
      // row. Silence would be indistinguishable from an account with no reach.
      const stored = await recordSnapshot(snapshot);
      await recordSnapshotOutcome({
        accountId: subject.accountId,
        platform: subject.platform,
        collectedAt,
        succeeded: observation.status !== "failed",
      });

      results.push({
        status: observation.status,
        diagnostic: observation.diagnostic,
        stored: stored.stored,
      });
    }

    const summary = {
      requestId,
      enabled: true,
      claimed: subjects.length,
      ok: results.filter((result) => result.status === "ok").length,
      partial: results.filter((result) => result.status === "partial").length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
    };
    // Deliberately no handles, account ids, or metric values in the log line.
    console.info("gwapscore_snapshot_collected", summary);
    return json({ ...summary, results });
  } catch (error) {
    console.error("gwapscore_snapshot_collection_failed", {
      requestId,
      name: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "Snapshot collection is temporarily unavailable", requestId }, 503);
  }
}

export async function GET(request: Request) {
  return collect(request);
}

export async function POST(request: Request) {
  return collect(request);
}
