import { NextResponse } from "next/server";
import { isValidInternalApiKey } from "../../../lib/daily-ideas-telegram-account-core";
import { PpvConfigurationError, reconcilePrograms } from "../../../lib/ppv-reputation-server";
import { shouldRunScheduledWorker } from "../../../lib/vercel-cron-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: responseHeaders });
}

/**
 * Reconciles the projection against chain. Vercel Cron presents CRON_SECRET;
 * the worker key covers manual backfills. Replays are idempotent, so running
 * this often is harmless and running it after a webhook outage is the repair.
 */
function authorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return (
    isValidInternalApiKey(authorization, process.env.CRON_SECRET) ||
    isValidInternalApiKey(authorization, process.env.PPV_RECONCILE_WORKER_KEY)
  );
}

async function reconcile(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  if (
    !shouldRunScheduledWorker({
      isVercelCron: request.headers.has("x-vercel-cron"),
      projectId: process.env.VERCEL_PROJECT_ID,
    })
  ) {
    return json({ ok: true, skipped: "NON_CANONICAL_VERCEL_PROJECT" });
  }
  const requested = Number(new URL(request.url).searchParams.get("limit"));
  try {
    const report = await reconcilePrograms({ maxTransactions: Number.isFinite(requested) && requested > 0 ? requested : 100 });
    return json({ ok: true, ...report });
  } catch (error) {
    if (error instanceof PpvConfigurationError) return json({ error: "PPV programs are not configured." }, 503);
    console.error("ppv_reconcile_failed", { name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Reconciliation failed." }, 500);
  }
}

export async function GET(request: Request) {
  return reconcile(request);
}

export async function POST(request: Request) {
  return reconcile(request);
}
