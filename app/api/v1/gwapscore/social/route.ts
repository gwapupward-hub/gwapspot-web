import { NextResponse } from "next/server";
import { authenticateGwapScoreRequest, gwapScoreErrorResponse } from "../../../../lib/gwapscore-social/http";
import { getSocialSummary } from "../../../../lib/gwapscore-social/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await authenticateGwapScoreRequest(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await getSocialSummary(identity.userId));
  } catch (error) {
    return gwapScoreErrorResponse(error);
  }
}
