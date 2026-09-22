import { NextResponse } from "next/server";
import { getPpvWorkspaceReadiness } from "../../../lib/ppv/readiness.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getPpvWorkspaceReadiness();
  return NextResponse.json(readiness, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex",
    },
  });
}
