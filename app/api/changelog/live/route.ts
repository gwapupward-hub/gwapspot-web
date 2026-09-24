import { NextResponse } from "next/server";
import { getBuildLogSnapshot } from "../../../lib/changelog-live.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getBuildLogSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
      "X-Robots-Tag": "noindex",
    },
  });
}
