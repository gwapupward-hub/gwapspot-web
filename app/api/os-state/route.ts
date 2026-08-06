import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  MAX_GWAP_OS_STATE_BYTES,
  normalizeGwapOsState,
} from "../../app/lib/os-state";
import {
  clearAccountWorkspace,
  loadAccountWorkspace,
  saveAccountWorkspace,
} from "../../app/lib/os-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../lib/request-guard";
import { isClerkConfigured } from "../../lib/auth-config";

export const runtime = "nodejs";

async function getUserId() {
  if (!isClerkConfigured()) return null;
  const { userId } = await auth();
  return userId;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hasCloudState, state } = await loadAccountWorkspace(userId);
  return NextResponse.json({ hasCloudState, state });
}

export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    auditAuthEvent("workspace.update", userId, "rejected");
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const rate = checkRateLimit(`workspace:${userId}`, 30, 60_000);
  if (!rate.allowed) {
    auditAuthEvent("workspace.update", userId, "rejected");
    return NextResponse.json(
      { error: "Too many updates" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_GWAP_OS_STATE_BYTES * 2) {
    return NextResponse.json({ error: "Workspace payload is too large" }, { status: 413 });
  }

  try {
    const payload = (await request.json()) as { state?: unknown };
    const state = normalizeGwapOsState(payload.state);
    const { account } = await loadAccountWorkspace(userId);
    state.profile.primaryWallet = account.verifiedWallet;
    const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
    if (bytes > MAX_GWAP_OS_STATE_BYTES) {
      return NextResponse.json({ error: "Workspace payload is too large" }, { status: 413 });
    }

    await saveAccountWorkspace(userId, state);
    auditAuthEvent("workspace.update", userId, "success");
    return NextResponse.json({ state });
  } catch {
    auditAuthEvent("workspace.update", userId, "failed");
    return NextResponse.json({ error: "Workspace update failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const rate = checkRateLimit(`workspace-reset:${userId}`, 5, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many reset requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    await clearAccountWorkspace(userId);
    auditAuthEvent("workspace.reset", userId, "success");
    return new NextResponse(null, { status: 204 });
  } catch {
    auditAuthEvent("workspace.reset", userId, "failed");
    return NextResponse.json({ error: "Workspace reset failed" }, { status: 500 });
  }
}
