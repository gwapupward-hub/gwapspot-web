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
  unlinkTelegramFromGwapAccount,
} from "../../../lib/gwap-account";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { auditAuthEvent, checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";
import {
  getTelegramLinkManagementSnapshot,
  removeDailyIdeasTelegramIdentityLink,
} from "../../../lib/telegram-account-link-management";
import { resolveGnsIdentity } from "../../../app/lib/gns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveAuthenticatedAccount(request: Request) {
  if (!isWalletAuthConfigured()) return { error: "Authentication unavailable", status: 503 as const };
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return { error: "Unauthorized", status: 401 as const };
  const gns = await resolveGnsIdentity(identity.verifiedWallet).catch(() => null);
  const gnsIdentity = gns?.status === "found" ? gns.name : null;
  const account = await resolveDailyIdeasGwapAccount(identity, { primaryGnsIdentity: gnsIdentity });
  return { identity, account, gnsIdentity };
}

export async function GET(request: Request) {
  const resolved = await resolveAuthenticatedAccount(request);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  try {
    const link = await getTelegramLinkManagementSnapshot(resolved.account.id);
    return NextResponse.json({
      linked: Boolean(link),
      identity: link,
      gwapIdentity: {
        accountId: resolved.account.id,
        gnsIdentity: resolved.gnsIdentity,
        primaryWallet: resolved.account.primaryWallet,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return NextResponse.json({ error: "Telegram link status is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const resolved = await resolveAuthenticatedAccount(request);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const rate = await checkRateLimit(`daily-ideas-account-unlink:${resolved.account.id}`, 6, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many unlink attempts" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  }

  try {
    const snapshot = await getTelegramLinkManagementSnapshot(resolved.account.id);
    if (!snapshot) return NextResponse.json({ linked: false });

    const canonical = await unlinkTelegramFromGwapAccount(resolved.account.id, snapshot.telegramUserId);
    if (!canonical.ok) {
      auditAuthEvent("daily-ideas.account-unlink", resolved.identity.userId, "failed");
      return NextResponse.json({ error: "The canonical GWAP account link could not be removed." }, { status: 409 });
    }

    const dailyIdeas = await removeDailyIdeasTelegramIdentityLink(resolved.account.id, snapshot.telegramUserId);
    if (!dailyIdeas.ok) {
      auditAuthEvent("daily-ideas.account-unlink", resolved.identity.userId, "failed");
      return NextResponse.json({ error: "The GWAP account was unlinked, but Daily Ideas cleanup needs a retry." }, { status: 409 });
    }

    auditAuthEvent("daily-ideas.account-unlink", resolved.identity.userId, "success");
    return NextResponse.json({
      linked: false,
      preserved: { savedIdeas: true, projects: true, gwapWorkspace: true },
    });
  } catch {
    auditAuthEvent("daily-ideas.account-unlink", resolved.identity.userId, "failed");
    return NextResponse.json({ error: "Telegram account unlinking is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const resolved = await resolveAuthenticatedAccount(request);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const rate = await checkRateLimit(`daily-ideas-account-link:${resolved.account.id}`, 12, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many link attempts" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
      );
    }

    const token = await inspectDailyIdeasAccountLinkToken(body?.token);
    if (!token) {
      auditAuthEvent("daily-ideas.account-link", resolved.identity.userId, "rejected");
      return NextResponse.json(
        { error: "This account-link request is invalid or has expired." },
        { status: 404 },
      );
    }

    const availability = await canLinkTelegramToGwapAccount(resolved.account.id, token.telegramUserId);
    if (!availability.ok) {
      const conflict = availability.reason === "telegram_already_linked" || availability.reason === "gwap_already_linked";
      auditAuthEvent("daily-ideas.account-link", resolved.identity.userId, "rejected");
      return NextResponse.json(
        { error: conflict ? "This Telegram or GWAP account is already linked to another identity." : "GWAP account linking is unavailable." },
        { status: conflict ? 409 : 503 },
      );
    }

    const result = await consumeDailyIdeasAccountLinkToken(body?.token, {
      gwapUserId: resolved.account.id,
      gnsIdentity: resolved.gnsIdentity,
    });

    if (!result.ok) {
      const conflict = result.reason === "telegram_already_linked" || result.reason === "gwap_already_linked";
      auditAuthEvent("daily-ideas.account-link", resolved.identity.userId, "rejected");
      return NextResponse.json(
        { error: conflict ? "This Telegram or GWAP account is already linked to another identity." : "This account-link request is invalid or has expired." },
        { status: conflict ? 409 : 404 },
      );
    }

    const canonicalLink = await linkTelegramToGwapAccount(resolved.account.id, result.link.telegramUserId, {
      primaryGnsIdentity: resolved.gnsIdentity,
    });
    if (!canonicalLink.ok) {
      auditAuthEvent("daily-ideas.account-link", resolved.identity.userId, "failed");
      return NextResponse.json(
        { error: "The Daily Ideas link completed but the GWAP account link could not be finalized. Retry from Telegram." },
        { status: 409 },
      );
    }

    auditAuthEvent("daily-ideas.account-link", resolved.identity.userId, "success");
    return NextResponse.json({
      linked: true,
      gwapUserId: canonicalLink.account.id,
      telegramUserId: result.link.telegramUserId,
      gnsIdentity: result.link.gnsIdentity,
      linkedAt: result.link.linkedAt,
    });
  } catch {
    auditAuthEvent("daily-ideas.account-link", resolved.identity.userId, "failed");
    return NextResponse.json({ error: "GWAP account linking is temporarily unavailable." }, { status: 503 });
  }
}
