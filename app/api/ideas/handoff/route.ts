import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import { consumeDailyIdeaHandoff } from "../../../lib/daily-ideas-handoff";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isWalletAuthConfigured()) {
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  }

  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const rate = await checkRateLimit(`ideas-handoff:${identity.userId}`, 12, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Handoff limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { token?: unknown };
    const idea = await consumeDailyIdeaHandoff(body.token);
    if (!idea) {
      return NextResponse.json({ error: "This Daily Ideas handoff is invalid or has expired." }, { status: 404 });
    }
    return NextResponse.json({ idea });
  } catch {
    return NextResponse.json({ error: "Daily Ideas handoff is temporarily unavailable." }, { status: 503 });
  }
}
