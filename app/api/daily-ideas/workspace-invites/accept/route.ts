import {
  authenticateWorkspace,
  memberDisplayName,
  readWorkspaceBody,
  workspaceJson,
} from "../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../lib/request-guard.ts";
import { auditAuthEvent } from "../../../../lib/request-guard.ts";
import { acceptWorkspaceInvite } from "../../../../lib/daily-ideas-collab-workspace.ts";
import { isProjectId, isValidInviteToken } from "../../../../lib/daily-ideas-workspace-core.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authed = await authenticateWorkspace(request, { requireOrigin: true });
  if ("error" in authed) return authed.error;

  const rate = await checkRateLimit(`di-workspace-invite-accept:${authed.accountId}`, 20, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 4_096);
  const token = body?.token;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!isValidInviteToken(token) || !isProjectId(projectId)) {
    return workspaceJson({ error: "This invite link is invalid or has expired." }, 404);
  }

  const result = await acceptWorkspaceInvite(authed.redis, {
    token,
    projectId,
    accountId: authed.accountId,
    member: {
      displayName: memberDisplayName(authed.account),
      wallet: authed.account.primaryWallet,
      gnsIdentity: authed.account.primaryGnsIdentity,
    },
  });

  if (!result.ok) {
    if (result.reason === "already_member") {
      auditAuthEvent("daily-ideas.workspace-invite-accept", authed.identity.userId, "success");
      return workspaceJson({ joined: false, alreadyMember: true, projectId });
    }
    auditAuthEvent("daily-ideas.workspace-invite-accept", authed.identity.userId, "rejected");
    const status =
      result.reason === "wrong_workspace" || result.reason === "workspace_missing" ? 404 : 410;
    const messages: Record<string, string> = {
      invalid: "This invite link is invalid or has expired.",
      used: "This invite link has already been used.",
      expired: "This invite link has expired.",
      workspace_missing: "This workspace no longer exists.",
      wrong_workspace: "This invite link is invalid or has expired.",
    };
    return workspaceJson(
      { error: messages[result.reason] ?? "This invite link is invalid or has expired." },
      status,
    );
  }

  auditAuthEvent("daily-ideas.workspace-invite-accept", authed.identity.userId, "success");
  return workspaceJson({ joined: true, role: result.role, projectId: result.workspace.projectId }, 201);
}
