import { NextResponse } from "next/server";
import {
  getDeveloperApiAccount,
  getDeveloperUsageAnalytics,
} from "../../../../app/lib/developer-api";
import { getAuthenticatedWalletIdentity } from "../../../../lib/privy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const requestedDays = Number(new URL(request.url).searchParams.get("days") || 30);
  const days = Number.isFinite(requestedDays)
    ? Math.max(1, Math.min(30, Math.floor(requestedDays)))
    : 30;

  try {
    const [account, daily] = await Promise.all([
      getDeveloperApiAccount(identity.userId),
      getDeveloperUsageAnalytics(identity.userId, days),
    ]);
    return NextResponse.json(
      {
        plan: account.plan,
        usage: account.usage,
        daily,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Developer analytics are temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
