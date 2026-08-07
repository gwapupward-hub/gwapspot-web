import { NextResponse } from "next/server";
import { clearAccountWorkspace } from "../../app/lib/os-server";
import { isWalletAuthConfigured } from "../../lib/auth-config";
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

    await getPrivyServerClient().users().delete(identity.userId);
    await Promise.all([
      clearAccountWorkspace(identity.userId),
      clearWalletIdentityCache(identity.userId),
    ]);
    auditAuthEvent("account.delete", identity.userId, "success");
    return new NextResponse(null, { status: 204 });
  } catch {
    auditAuthEvent("account.delete", identity.userId, "failed");
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }
}
