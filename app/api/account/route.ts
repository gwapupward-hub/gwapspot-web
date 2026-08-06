import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../lib/request-guard";
import { isClerkConfigured } from "../../lib/auth-config";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  if (!isClerkConfigured()) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    auditAuthEvent("account.delete", userId, "rejected");
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const rate = checkRateLimit(`account-delete:${userId}`, 3, 60 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many deletion attempts" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { confirmation?: unknown };
    if (body.confirmation !== "DELETE") {
      auditAuthEvent("account.delete", userId, "rejected");
      return NextResponse.json({ error: "Confirmation is required" }, { status: 400 });
    }

    const client = await clerkClient();
    await client.users.deleteUser(userId);
    auditAuthEvent("account.delete", userId, "success");
    return new NextResponse(null, { status: 204 });
  } catch {
    auditAuthEvent("account.delete", userId, "failed");
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }
}
