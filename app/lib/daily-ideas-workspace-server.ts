import "server-only";

import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "./auth-config.ts";
import { resolveDailyIdeasGwapAccount } from "./daily-ideas-gwap-account.ts";
import type { GwapAccountRecord } from "./gwap-account-core.ts";
import { getAuthenticatedWalletIdentity, type WalletIdentity } from "./privy-server.ts";
import { getWorkspaceRedis, type WorkspaceRedis } from "./redis.ts";
import { hasValidOrigin } from "./request-guard.ts";
import {
  isProjectId,
  type WorkspaceCapability,
  can,
} from "./daily-ideas-workspace-core.ts";
import {
  resolveWorkspaceForAccount,
  type WorkspaceAccess,
} from "./daily-ideas-collab-workspace.ts";

export function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export function memberDisplayName(account: GwapAccountRecord) {
  return account.primaryGnsIdentity
    ? `${account.primaryGnsIdentity}.gwap`
    : compactWallet(account.primaryWallet);
}

export type AuthedContext = {
  identity: WalletIdentity;
  account: GwapAccountRecord;
  accountId: string;
  redis: WorkspaceRedis;
};

type ErrorResponse = { error: NextResponse };

export function workspaceJson(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
      ...headers,
    },
  });
}

export async function authenticateWorkspace(
  request: Request,
  options: { requireOrigin?: boolean } = {},
): Promise<AuthedContext | ErrorResponse> {
  if (!isWalletAuthConfigured()) {
    return { error: workspaceJson({ error: "Authentication unavailable" }, 503) };
  }
  if (options.requireOrigin && !hasValidOrigin(request)) {
    return { error: workspaceJson({ error: "Invalid origin" }, 403) };
  }
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return { error: workspaceJson({ error: "Unauthorized" }, 401) };

  try {
    const account = await resolveDailyIdeasGwapAccount(identity);
    return { identity, account, accountId: account.id, redis: getWorkspaceRedis() };
  } catch {
    return { error: workspaceJson({ error: "GWAP account identity could not be resolved" }, 409) };
  }
}

export type WorkspaceContext = AuthedContext & WorkspaceAccess;

/**
 * Loads the authenticated account and the workspace it can access for a
 * projectId. Returns 404 (never 403) when no accessible workspace exists so we
 * do not reveal a workspace's existence to unrelated accounts.
 */
export async function loadWorkspaceContext(
  request: Request,
  projectId: string,
  options: { requireOrigin?: boolean } = {},
): Promise<WorkspaceContext | ErrorResponse> {
  if (!isProjectId(projectId)) {
    return { error: workspaceJson({ error: "Workspace not found" }, 404) };
  }
  const authed = await authenticateWorkspace(request, options);
  if ("error" in authed) return authed;

  const access = await resolveWorkspaceForAccount(authed.redis, projectId, authed.accountId);
  if (!access) return { error: workspaceJson({ error: "Workspace not found" }, 404) };

  return { ...authed, ...access };
}

/** Enforces a capability against the caller's membership role. */
export function requireCapability(
  context: WorkspaceContext,
  capability: WorkspaceCapability,
): ErrorResponse | null {
  if (!can(context.membership.role, capability)) {
    return { error: workspaceJson({ error: "Insufficient permissions" }, 403) };
  }
  return null;
}

export async function readWorkspaceBody(request: Request, maxBytes = 1_048_576) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
