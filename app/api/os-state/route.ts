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
import { isWalletAuthConfigured } from "../../lib/auth-config";
import { getOrCreateGwapAccount } from "../../lib/gwap-account";
import { getAuthenticatedWalletIdentity } from "../../lib/privy-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../lib/request-guard";

export const runtime = "nodejs";

async function authenticate(request?: Request) {
  if (!isWalletAuthConfigured()) return null;
  return getAuthenticatedWalletIdentity(request);
}

export async function GET(request: Request) {
  const identity = await authenticate(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hasCloudState, state } = await loadAccountWorkspace(identity);
  return NextResponse.json({ hasCloudState, state });
}

export async function PUT(request: Request) {
  const identity = await authenticate(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    auditAuthEvent("workspace.update", identity.userId, "rejected");
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const gwapAccount = await getOrCreateGwapAccount(identity);
  const rate = await checkRateLimit(`workspace:${gwapAccount.id}`, 30, 60_000);
  if (!rate.allowed) {
    auditAuthEvent("workspace.update", identity.userId, "rejected");
    return NextResponse.json(
      { error: "Too many updates" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_GWAP_OS_STATE_BYTES * 2) {
    return NextResponse.json(
      { error: "Workspace payload is too large" },
      { status: 413 },
    );
  }

  try {
    const payload = (await request.json()) as { state?: unknown };
    const state = normalizeGwapOsState(payload.state);
    state.profile.primaryWallet = identity.verifiedWallet;
    const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
    if (bytes > MAX_GWAP_OS_STATE_BYTES) {
      return NextResponse.json(
        { error: "Workspace payload is too large" },
        { status: 413 },
      );
    }

    await saveAccountWorkspace(gwapAccount.id, state);
    auditAuthEvent("workspace.update", identity.userId, "success");
    return NextResponse.json({ state });
  } catch {
    auditAuthEvent("workspace.update", identity.userId, "failed");
    return NextResponse.json({ error: "Workspace update failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const identity = await authenticate(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const gwapAccount = await getOrCreateGwapAccount(identity);
  const rate = await checkRateLimit(
    `workspace-reset:${gwapAccount.id}`,
    5,
    60_000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many reset requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    await clearAccountWorkspace(gwapAccount.id);
    auditAuthEvent("workspace.reset", identity.userId, "success");
    return new NextResponse(null, { status: 204 });
  } catch {
    auditAuthEvent("workspace.reset", identity.userId, "failed");
    return NextResponse.json({ error: "Workspace reset failed" }, { status: 500 });
  }
}
