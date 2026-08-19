import { NextResponse } from "next/server";
import {
  gwapScoreErrorResponse,
  hasValidInternalSecret,
} from "../../../../../../lib/gwapscore-social/http";
import { processActiveXChallenges } from "../../../../../../lib/gwapscore-social/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await processActiveXChallenges());
  } catch (error) {
    return gwapScoreErrorResponse(error);
  }
}
