import { NextResponse } from "next/server";
import {
  authenticateGwapScoreRequest,
  guardGwapScoreMutation,
  gwapScoreErrorResponse,
} from "../../../../../../lib/gwapscore-social/http";
import {
  checkChallenge,
  getChallengeStatus,
} from "../../../../../../lib/gwapscore-social/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = await authenticateGwapScoreRequest(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    return NextResponse.json(await getChallengeStatus(identity.userId, id));
  } catch (error) {
    return gwapScoreErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = await authenticateGwapScoreRequest(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rejected = await guardGwapScoreMutation(request, identity.userId, "check", 20);
  if (rejected) return rejected;

  try {
    const { id } = await context.params;
    return NextResponse.json(await checkChallenge(identity.userId, id));
  } catch (error) {
    return gwapScoreErrorResponse(error);
  }
}
