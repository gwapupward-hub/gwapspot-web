import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import {
  consumeDailyIdeasAccountLinkToken,
  inspectDailyIdeasAccountLinkToken,
} from "../../../lib/daily-ideas-identity-link";
import { resolveDailyIdeasGwapAccount } from "../../../lib/daily-ideas-gwap-account";
import {
  canLinkTelegramToGwapAccount,
  linkTelegramToGwapAccount,
} from "../../../lib/gwap-account";
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

  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const gns = await resolveGnsIdentity(identity.verifiedWallet).catch(() => null);
    const gnsIdentity = gns?.status === "found" ? gns.name : null;
    const account = await resolveDailyIdeasGwapAccount(identity, {
      primaryGnsIdentity: gnsIdentity,
    });

    const rate = await checkRateLimit(`daily-ideas-account-link:${account.id}`, 12, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many link attempts" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
      );
    }

    const token = await inspectDailyIdeasAccountLinkToken(body?.token);
    if (!token) {
      auditAuthEvent("daily-ideas.account-link", identity.userId, "rejected");
      return NextResponse.json(
        { error: "This account-link request is invalid or has expired." },
        { status: 404 },
      );
    }

    const availability = await canLinkTelegramToGwapAccount(account.id, token.telegramUserId);
    if (!availability.ok) {
      const conflict = availability.reason === "telegram_already_linked" || availability.reason === "gwap_already_linked";
      auditAuthEvent("daily-ideas.account-link", identity.userId, "rejected");
      return NextResponse.json(
        { error: conflict ? "This Telegram or GWAP account is already linked to another identity." : "GWAP account linking is unavailable." },
        { status: conflict ? 409 : 503 },
      );
    }

    const result = await consumeDailyIdeasAccountLinkToken(body?.token, {
      gwapUserId: account.id,
      gnsIdentity,
    });

    if (!result.ok) {
      const conflict = result.reason === "telegram_already_linked" || result.reason === "gwap_already_linked";
      auditAuthEvent("daily-ideas.account-link", identity.userId, "rejected");
      return NextResponse.json(
        { error: conflict ? "This Telegram or GWAP account is already linked to another identity." : "This account-link request is invalid or has expired." },
        { status: conflict ? 409 : 404 },
      );
    }

    const canonicalLink = await linkTelegramToGwapAccount(account.id, result.link.telegramUserId, {
      primaryGnsIdentity: gnsIdentity,
    });
    if (!canonicalLink.ok) {
      auditAuthEvent("daily-ideas.account-link", identity.userId, "failed");
      return NextResponse.json(
        { error: "The Daily Ideas link completed but the GWAP account link could not be finalized. Retry from Telegram." },
        { status: 409 },
      );
    }

    auditAuthEvent("daily-ideas.account-link", identity.userId, "success");
    return NextResponse.json({
      linked: true,
      gwapUserId: canonicalLink.account.id,
      telegramUserId: result.link.telegramUserId,
      gnsIdentity: result.link.gnsIdentity,
      linkedAt: result.link.linkedAt,
    });
  } catch {
    auditAuthEvent("daily-ideas.account-link", identity.userId, "failed");
    return NextResponse.json({ error: "GWAP account linking is temporarily unavailable." }, { status: 503 });
  }
}
