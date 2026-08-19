import { NextResponse } from "next/server";
import {
  authenticateGwapScoreRequest,
  guardGwapScoreMutation,
  gwapScoreErrorResponse,
} from "../../../../../lib/gwapscore-social/http";
import { issueChallenge } from "../../../../../lib/gwapscore-social/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await authenticateGwapScoreRequest(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rejected = await guardGwapScoreMutation(request, identity.userId, "challenge", 6);
  if (rejected) return rejected;

  try {
    const body = (await request.json()) as { socialAccountId?: unknown };
    if (typeof body.socialAccountId !== "string" || !body.socialAccountId) {
      return NextResponse.json({ error: "socialAccountId is required" }, { status: 400 });
    }
    const result = await issueChallenge(identity.userId, body.socialAccountId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return gwapScoreErrorResponse(error);
  }
}
