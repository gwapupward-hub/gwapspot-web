import { NextResponse } from "next/server";
import { authenticateGwapScoreRequest } from "../../../../../../lib/gwapscore-social/http";
import { getOwnedSocialAccount } from "../../../../../../lib/gwapscore-social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = await authenticateGwapScoreRequest(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const account = await getOwnedSocialAccount(identity.userId, id);
  if (!account) return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  return NextResponse.json({ account });
}
