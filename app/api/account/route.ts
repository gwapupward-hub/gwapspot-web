import { NextResponse } from "next/server";
import { deleteDeveloperApiAccount } from "../../app/lib/developer-api";
import { deleteDeveloperBillingAccount } from "../../app/lib/developer-billing";
import { clearAccountWorkspace } from "../../app/lib/os-server";
import { resolveGnsIdentity } from "../../app/lib/gns";
import { deleteAccountInRecoverableOrder } from "../../lib/account-deletion-core";
import { isWalletAuthConfigured } from "../../lib/auth-config";
import { deleteDailyIdeasDataForGwapAccount } from "../../lib/daily-ideas-account-cleanup";
import { resolveDailyIdeasGwapAccount } from "../../lib/daily-ideas-gwap-account";
import {
  deleteGwapAccount,
  getOrCreateGwapAccount,
} from "../../lib/gwap-account";
import {
  clearWalletIdentityCache,
  getAuthenticatedWalletIdentity,
  getPrivyServerClient,
} from "../../lib/privy-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isWalletAuthConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 },
    );
  }

  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const gns = await resolveGnsIdentity(identity.verifiedWallet).catch(() => null);
    const account = await resolveDailyIdeasGwapAccount(identity, {
      primaryGnsIdentity: gns?.status === "found" ? gns.name : null,
    });

    return NextResponse.json(
      {
        id: account.id,
        linkedAccounts: {
          privy: true,
          telegram: account.telegramUserId
            ? { userId: account.telegramUserId }
            : null,
        },
        wallets: account.wallets.map((wallet) => ({
          address: wallet.address,
          kind: wallet.kind,
          primary: wallet.address === account.primaryWallet,
        })),
        primaryWallet: account.primaryWallet,
        primaryGnsIdentity: account.primaryGnsIdentity,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "GWAP account is temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isWalletAuthConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 },
    );
  }

  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    auditAuthEvent("account.delete", identity.userId, "rejected");
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const rate = await checkRateLimit(
    `account-delete:${identity.userId}`,
    3,
    60 * 60_000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many deletion attempts" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { confirmation?: unknown };
    if (body.confirmation !== "DELETE") {
      auditAuthEvent("account.delete", identity.userId, "rejected");
      return NextResponse.json({ error: "Confirmation is required" }, { status: 400 });
    }

    const gwapAccount = await getOrCreateGwapAccount(identity);
    await deleteAccountInRecoverableOrder({
      purgeApplicationData: async () => {
        // Billing cleanup runs first because an active Stripe subscription must
        // block deletion before any other account data is changed.
        await deleteDeveloperBillingAccount(identity.userId);
        await Promise.all([
          deleteDeveloperApiAccount(identity.userId),
          clearAccountWorkspace(gwapAccount.id),
          deleteDailyIdeasDataForGwapAccount(gwapAccount.id),
          clearWalletIdentityCache(identity.userId),
        ]);
        await deleteGwapAccount(gwapAccount.id);
      },
      deleteIdentity: async () => {
        await getPrivyServerClient().users().delete(identity.userId);
      },
    });
    auditAuthEvent("account.delete", identity.userId, "success");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    auditAuthEvent("account.delete", identity.userId, "failed");
    if (
      error instanceof Error &&
      error.message === "ACTIVE_DEVELOPER_SUBSCRIPTION"
    ) {
      return NextResponse.json(
        {
          error:
            "Cancel the active developer subscription before deleting this account.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }
}
