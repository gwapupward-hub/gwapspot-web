import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import { consumeDailyIdeasAccountLinkToken } from "../../../lib/daily-ideas-identity-link";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { auditAuthEvent, checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";
import { resolveGnsIdentity } from "../../../app/lib/gns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isWalletAuthConfigured()) {
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  }

  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const rate = await checkRateLimit(`daily-ideas-account-link:${identity.userId}`, 12, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many link attempts" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const gns = await resolveGnsIdentity(identity.verifiedWallet).catch(() => null);
    const result = await consumeDailyIdeasAccountLinkToken(body?.token, {
      gwapUserId: identity.userId,
      gnsIdentity: gns?.status === "found" ? gns.name : null,
    });

    if (!result.ok) {
      const conflict = result.reason === "telegram_already_linked" || result.reason === "gwap_already_linked";
      auditAuthEvent("daily-ideas.account-link", identity.userId, "rejected");
      return NextResponse.json(
        { error: conflict ? "This Telegram or GWAP account is already linked to another identity." : "This account-link request is invalid or has expired." },
        { status: conflict ? 409 : 404 },
      );
    }

    auditAuthEvent("daily-ideas.account-link", identity.userId, "success");
    return NextResponse.json({
      linked: true,
      telegramUserId: result.link.telegramUserId,
      gnsIdentity: result.link.gnsIdentity,
      linkedAt: result.link.linkedAt,
    });
  } catch {
    auditAuthEvent("daily-ideas.account-link", identity.userId, "failed");
    return NextResponse.json({ error: "Daily Ideas account linking is temporarily unavailable." }, { status: 503 });
  }
}
