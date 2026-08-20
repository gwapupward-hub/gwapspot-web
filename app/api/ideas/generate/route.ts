import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import {
  DailyIdeasConfigurationError,
  getDailyIdeasConfiguration,
} from "../../../lib/daily-ideas-generator";
import { resolveDailyIdeasGwapAccount } from "../../../lib/daily-ideas-gwap-account";
import { getNextDailyIdea } from "../../../lib/daily-ideas-inventory";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";

export const runtime = "nodejs";

export async function GET() {
  const configuration = getDailyIdeasConfiguration();
  return NextResponse.json({
    service: "daily-ideas-generator",
    configured: configuration.configured,
    model: configuration.model,
    modelSource: configuration.modelSource,
    persistence: "inventory",
  });
}

export async function POST(request: Request) {
  if (!isWalletAuthConfigured()) {
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  }

  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  let account;
  try {
    account = await resolveDailyIdeasGwapAccount(identity);
  } catch {
    return NextResponse.json({ error: "GWAP account identity could not be resolved" }, { status: 409 });
  }

  const rate = await checkRateLimit(`ideas-generate:${account.id}`, 8, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Idea generation limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { category?: unknown };
    const result = await getNextDailyIdea({
      subject: `gwap:${account.id}`,
      category: body.category,
      mode: "idea",
    });
    return NextResponse.json({ idea: result.idea, delivery: result.delivery });
  } catch (error) {
    if (error instanceof DailyIdeasConfigurationError) {
      console.error("daily_ideas_generate_configuration_error", { message: error.message });
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("daily_ideas_generate_failed", {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Daily Ideas could not generate an idea right now." }, { status: 502 });
  }
}
