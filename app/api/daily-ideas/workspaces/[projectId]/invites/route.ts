import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import { createWorkspaceInvite } from "../../../../../lib/daily-ideas-workspace-invites.ts";
import { recordWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";
import { isAssignableInviteRole } from "../../../../../lib/daily-ideas-workspace-core.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "members:manage");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-invites:${resolved.accountId}`, 20, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 4_096);
  const role = body?.role;
  if (!isAssignableInviteRole(role)) return workspaceJson({ error: "Choose a collaborator role" }, 400);

  const { redis, workspace, membership } = resolved;
  const result = await createWorkspaceInvite(redis, {
    workspaceId: workspace.id,
    role,
    createdBy: resolved.accountId,
  });
  if (!result.ok) return workspaceJson({ error: "Invite could not be created" }, 400);

  await recordWorkspaceActivity(redis, {
    workspaceId: workspace.id,
    type: "invite_created",
    actorId: resolved.accountId,
    actorName: membership.displayName,
    summary: `Created a ${role} invite link`,
  });

  // The client composes the absolute URL using its own origin. Only the raw
  // token is returned here — the server persists only its hash.
  return workspaceJson(
    {
      token: result.token,
      role: result.invite.role,
      expiresAt: result.invite.expiresAt,
      path: `/app/ideas/workspace/${projectId}?invite=${result.token}`,
    },
    201,
  );
}
