import {
  authenticateWorkspace,
  loadWorkspaceContext,
  memberDisplayName,
  readWorkspaceBody,
  workspaceJson,
} from "../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../lib/request-guard.ts";
import { auditAuthEvent } from "../../../../lib/request-guard.ts";
import { gwapDailyIdeasSubject } from "../../../../lib/daily-ideas-identity-link.ts";
import { getDailyIdeaProject } from "../../../../lib/daily-ideas-projects.ts";
import { createWorkspace } from "../../../../lib/daily-ideas-collab-workspace.ts";
import { listWorkspaceMembers } from "../../../../lib/daily-ideas-workspace-members.ts";
import { listWorkspaceTasks } from "../../../../lib/daily-ideas-workspace-tasks.ts";
import { listWorkspaceActivity } from "../../../../lib/daily-ideas-workspace-activity.ts";
import {
  isProjectId,
  workspaceCapabilities,
  type WorkspaceMember,
  type WorkspaceTask,
} from "../../../../lib/daily-ideas-workspace-core.ts";
import { getWorkspaceSandboxProvider, isSandboxExecutionConfigured } from "../../../../lib/workspace-sandbox/index.ts";
import { getWorkspaceDeployment } from "../../../../lib/daily-ideas-workspace-deployment.ts";
import { findPublicationByWorkspace, getPublicationDraft, readRegistry } from "../../../../lib/gwap-browser-registry.ts";
import { gwapBrowserFlags } from "../../../../lib/gwap-browser-server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicMember(member: WorkspaceMember) {
  return {
    accountId: member.accountId,
    role: member.role,
    displayName: member.displayName,
    gnsIdentity: member.gnsIdentity,
    joinedAt: member.joinedAt,
  };
}

function taskSummary(tasks: WorkspaceTask[]) {
  const byStatus = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const task of tasks) byStatus[task.status] += 1;
  return { total: tasks.length, open: tasks.length - byStatus.done, byStatus };
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;

  const rate = await checkRateLimit(`di-workspace-read:${resolved.accountId}`, 120, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const { redis, workspace, membership } = resolved;
  const [members, tasks, activity, deployment, registry, draft] = await Promise.all([
    listWorkspaceMembers(redis, workspace.id),
    listWorkspaceTasks(redis, workspace.id),
    listWorkspaceActivity(redis, workspace.id, { limit: 10 }),
    getWorkspaceDeployment(redis, workspace.id).catch(() => null),
    readRegistry(redis).catch(() => null),
    getPublicationDraft(redis, workspace.id).catch(() => null),
  ]);
  const publication = registry ? findPublicationByWorkspace(registry, workspace.id) : null;

  return workspaceJson({
    workspace: {
      id: workspace.id,
      projectId: workspace.projectId,
      ideaId: workspace.ideaId,
      title: workspace.title,
      summary: workspace.summary,
      category: workspace.category,
      stage: workspace.stage,
      status: workspace.status,
      sandbox: { status: workspace.sandbox.status, provider: workspace.sandbox.provider },
      ownerAccountId: workspace.ownerAccountId,
      createdAt: workspace.createdAt,
      lastActivityAt: workspace.lastActivityAt,
    },
    role: membership.role,
    capabilities: workspaceCapabilities(membership.role),
    members: members.map(publicMember),
    memberCount: members.length,
    tasks: taskSummary(tasks),
    activity,
    sandboxExecutionConfigured: isSandboxExecutionConfigured(),
    deployment: deployment ? { status: "connected", provider: deployment.provider, host: new URL(deployment.url).hostname } : null,
    publication: publication
      ? { status: publication.status === "suspended" ? "suspended" : publication.visibility, address: publication.address, version: publication.version }
      : draft
        ? { status: "draft", address: null, version: null }
        : null,
    gwapBrowser: gwapBrowserFlags(),
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  if (!isProjectId(projectId)) return workspaceJson({ error: "Invalid project" }, 400);

  const authed = await authenticateWorkspace(request, { requireOrigin: true });
  if ("error" in authed) return authed.error;

  const rate = await checkRateLimit(`di-workspace-create:${authed.accountId}`, 20, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  // Only the account that owns the underlying Daily Ideas project may create
  // its workspace — resolved from the owner's private project store.
  const subject = gwapDailyIdeasSubject(authed.accountId);
  const project = await getDailyIdeaProject(subject, projectId);
  if (!project) return workspaceJson({ error: "Workspace not found" }, 404);

  await readWorkspaceBody(request).catch(() => null);

  try {
    const provider = getWorkspaceSandboxProvider();
    const result = await createWorkspace(authed.redis, provider, {
      projectId,
      ideaId: project.ideaId,
      ownerAccountId: authed.accountId,
      title: project.title,
      summary: project.summary,
      category: project.category,
      stage: project.status === "archived" ? "building" : project.status,
      buildRoadmap: project.buildRoadmap,
      firstAction: project.firstAction,
      scaffoldProject: {
        title: project.title,
        summary: project.summary,
        category: project.category,
        problemDefinition: project.problemDefinition,
        targetCustomer: project.targetCustomer,
        marketHypothesis: project.marketHypothesis,
        businessModel: project.businessModel,
        validationPlan: project.validationPlan,
        mvpFeatures: project.mvpFeatures,
        technicalArchitecture: project.technicalArchitecture,
        estimatedCost: project.estimatedCost,
        buildRoadmap: project.buildRoadmap,
        goToMarket: project.goToMarket,
        risks: project.risks,
        firstAction: project.firstAction,
      },
      owner: {
        displayName: memberDisplayName(authed.account),
        wallet: authed.account.primaryWallet,
        gnsIdentity: authed.account.primaryGnsIdentity,
      },
    });
    auditAuthEvent("daily-ideas.workspace-create", authed.identity.userId, "success");
    return workspaceJson(
      { created: result.created, workspaceId: result.workspace.id, projectId },
      result.created ? 201 : 200,
    );
  } catch {
    auditAuthEvent("daily-ideas.workspace-create", authed.identity.userId, "failed");
    return workspaceJson({ error: "Workspace could not be created" }, 503);
  }
}
