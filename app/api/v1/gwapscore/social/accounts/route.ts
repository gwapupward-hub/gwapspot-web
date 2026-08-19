import { NextResponse } from "next/server";
import {
  authenticateGwapScoreRequest,
  guardGwapScoreMutation,
  gwapScoreErrorResponse,
} from "../../../../../lib/gwapscore-social/http";
import {
  claimXAccount,
  getSocialSummary,
} from "../../../../../lib/gwapscore-social/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await authenticateGwapScoreRequest(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await getSocialSummary(identity.userId);
    return NextResponse.json({ accounts: summary.accounts });
  } catch (error) {
    return gwapScoreErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const identity = await authenticateGwapScoreRequest(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rejected = await guardGwapScoreMutation(request, identity.userId, "claim", 6);
  if (rejected) return rejected;

  try {
    const body = (await request.json()) as { platform?: unknown; username?: unknown };
    if (body.platform !== "x" || typeof body.username !== "string") {
      return NextResponse.json({ error: "platform=x and username are required" }, { status: 400 });
    }
    const account = await claimXAccount(identity.userId, body.username);
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return gwapScoreErrorResponse(error);
  }
}
