import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import {
  DailyIdeasConfigurationError,
  generateDailyIdea,
} from "../../../lib/daily-ideas-generator";
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

  const rate = await checkRateLimit(`ideas-generate:${identity.userId}`, 8, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Idea generation limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { category?: unknown };
    return NextResponse.json({ idea: await generateDailyIdea(body.category) });
  } catch (error) {
    if (error instanceof DailyIdeasConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Daily Ideas could not generate an idea right now." }, { status: 502 });
  }
}
