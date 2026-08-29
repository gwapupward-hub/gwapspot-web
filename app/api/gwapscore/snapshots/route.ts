import { NextResponse } from "next/server";
import { resolveDailyIdeasGwapAccount } from "../../../lib/daily-ideas-gwap-account";
import {
  ENGAGEMENT_WINDOW_HOURS,
  MAX_SNAPSHOT_HISTORY,
  SNAPSHOT_CADENCE_HOURS,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_TTL_SECONDS,
  deriveSnapshotSeries,
} from "../../../lib/gwapscore-snapshot-core";
import {
  getLatestSnapshot,
  getSnapshotSubject,
  listSnapshotHistory,
  snapshotCollectionEnabled,
} from "../../../lib/gwapscore-snapshots";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { getSocialVerification } from "../../../lib/social-proof-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 60;

function numericParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const offset = numericParam(url.searchParams.get("offset"), 0);
  const limit = Math.min(MAX_PAGE_SIZE, numericParam(url.searchParams.get("limit"), 30) || 30);

  try {
    const account = await resolveDailyIdeasGwapAccount(identity);
    const [verification, subject, latest, history] = await Promise.all([
      getSocialVerification(account.id, "x"),
      getSnapshotSubject(account.id, "x"),
      getLatestSnapshot(account.id, "x"),
      listSnapshotHistory(account.id, "x", { offset, limit }),
    ]);

    return NextResponse.json(
      {
        config: {
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          enabled: snapshotCollectionEnabled(),
          cadenceHours: SNAPSHOT_CADENCE_HOURS,
          engagementWindowHours: ENGAGEMENT_WINDOW_HOURS,
          retentionSnapshots: MAX_SNAPSHOT_HISTORY,
          retentionDays: Math.round(SNAPSHOT_TTL_SECONDS / (24 * 60 * 60)),
          // Snapshot v1 collects evidence only. No scoring is derived from it.
          scoreImpact: "none",
        },
        verification: verification
          ? { status: verification.status, socialHandle: verification.socialHandle, verifiedAt: verification.verifiedAt }
          : null,
        subject: subject
          ? {
              platform: subject.platform,
              socialHandle: subject.socialHandle,
              verifiedAt: subject.verifiedAt,
              nextSnapshotAt: subject.nextSnapshotAt,
              lastSnapshotAt: subject.lastSnapshotAt,
            }
          : null,
        latest,
        snapshots: history.items,
        series: deriveSnapshotSeries(history.all),
        page: { total: history.total, offset: history.offset, limit: history.limit, nextOffset: history.nextOffset },
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Snapshot history is temporarily unavailable" },
      { status: 503 },
    );
  }
}
