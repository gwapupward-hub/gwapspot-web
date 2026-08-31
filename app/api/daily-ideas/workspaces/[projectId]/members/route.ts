import {
  loadWorkspaceContext,
  memberDisplayName,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import { isSolanaAddress } from "../../../../../lib/gwap-account-core.ts";
import { getGwapAccountForWallet } from "../../../../../lib/gwap-account.ts";
import { resolveGnsName } from "../../../../../app/lib/gns.ts";
import {
  changeWorkspaceMemberRole,
  listWorkspaceMembers,
  removeWorkspaceMember,
  upsertWorkspaceMember,
} from "../../../../../lib/daily-ideas-workspace-members.ts";
import { recordWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";
import {
  isAssignableInviteRole,
  isWorkspaceRole,
  type WorkspaceMember,
} from "../../../../../lib/daily-ideas-workspace-core.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicMember(member: WorkspaceMember) {
  return {
    accountId: member.accountId,
    role: member.role,
    displayName: member.displayName,
    gnsIdentity: member.gnsIdentity,
    invitedBy: member.invitedBy,
    joinedAt: member.joinedAt,
  };
}

async function resolveInviteeWallet(identifier: string) {
  const trimmed = identifier.trim();
  if (isSolanaAddress(trimmed)) return trimmed;
  const name = identifier.trim().replace(/\.gwap$/i, "").trim();
  if (!/^[a-z0-9-]{1,63}$/i.test(name)) return null;
  const resolved = await resolveGnsName(name).catch(() => null);
  return resolved?.found && resolved.owner ? resolved.owner : null;
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  const members = await listWorkspaceMembers(resolved.redis, resolved.workspace.id);
  return workspaceJson({ members: members.map(publicMember), role: resolved.membership.role });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "members:manage");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-members:${resolved.accountId}`, 40, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 16_384);
  if (!body || typeof body.action !== "string") return workspaceJson({ error: "Invalid request" }, 400);

  const { redis, workspace, membership } = resolved;
  const index = { projectId: workspace.projectId, ownerAccountId: workspace.ownerAccountId, title: workspace.title };
  const actor = { actorId: resolved.accountId, actorName: membership.displayName };

  if (body.action === "invite-direct") {
    const identifier = typeof body.identifier === "string" ? body.identifier : "";
    const role = body.role;
    if (!identifier.trim() || !isAssignableInviteRole(role)) {
      return workspaceJson({ error: "Provide a .gwap name or wallet and a valid role" }, 400);
    }
    const wallet = await resolveInviteeWallet(identifier);
    if (!wallet) return workspaceJson({ error: "That identity could not be resolved" }, 404);
    const target = await getGwapAccountForWallet(wallet);
    if (!target) return workspaceJson({ error: "That identity has not joined GwapOS yet" }, 404);
    if (target.id === resolved.accountId) return workspaceJson({ error: "You cannot invite yourself" }, 400);

    const existing = (await listWorkspaceMembers(redis, workspace.id)).find((member) => member.accountId === target.id);
    if (existing) return workspaceJson({ error: "That identity is already a collaborator", member: publicMember(existing) }, 409);

    const member: WorkspaceMember = {
      accountId: target.id,
      role,
      displayName: memberDisplayName(target),
      wallet: target.primaryWallet,
      gnsIdentity: target.primaryGnsIdentity,
      invitedBy: resolved.accountId,
      joinedAt: new Date().toISOString(),
    };
    await upsertWorkspaceMember(redis, workspace.id, member, index);
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: "member_joined",
      summary: `${member.displayName} added as ${role}`,
      ...actor,
    });
    return workspaceJson({ member: publicMember(member) }, 201);
  }

  if (body.action === "change-role") {
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    const role = body.role;
    if (!accountId || !isWorkspaceRole(role)) return workspaceJson({ error: "Invalid role change" }, 400);
    if (role === "owner") return workspaceJson({ error: "A second owner cannot be assigned" }, 400);
    const result = await changeWorkspaceMemberRole(redis, workspace.id, accountId, role, index);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : result.reason === "last_owner" ? 409 : 400;
      return workspaceJson({ error: result.reason === "last_owner" ? "The final owner cannot be demoted" : "Role change failed" }, status);
    }
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: "member_role_changed",
      summary: `${result.member.displayName} is now ${role}`,
      ...actor,
    });
    return workspaceJson({ member: publicMember(result.member) });
  }

  if (body.action === "remove") {
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    if (!accountId) return workspaceJson({ error: "Invalid member" }, 400);
    const result = await removeWorkspaceMember(redis, workspace.id, accountId);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return workspaceJson({ error: result.reason === "last_owner" ? "The final owner cannot be removed" : "Member not found" }, status);
    }
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: "member_removed",
      summary: `${result.member.displayName} was removed`,
      ...actor,
    });
    return workspaceJson({ removed: true });
  }

  return workspaceJson({ error: "Unsupported action" }, 400);
}
