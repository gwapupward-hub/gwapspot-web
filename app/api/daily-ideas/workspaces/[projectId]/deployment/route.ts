import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import { recordWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";
import { touchWorkspaceActivity } from "../../../../../lib/daily-ideas-collab-workspace.ts";
import {
  getWorkspaceDeployment,
  removeWorkspaceDeployment,
  toDeploymentView,
  upsertWorkspaceDeployment,
} from "../../../../../lib/daily-ideas-workspace-deployment.ts";
import {
  findPublicationByWorkspace,
  readRegistry,
} from "../../../../../lib/gwap-browser-registry.ts";
import {
  DEPLOYMENT_PROVIDER_LABELS,
  describeDeploymentUrlFailure,
} from "../../../../../lib/gwap-browser-core.ts";
import { gwapBrowserFlags } from "../../../../../lib/gwap-browser-server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "deployment:read");
  if (denied) return denied.error;

  const [deployment, registry] = await Promise.all([
    getWorkspaceDeployment(resolved.redis, resolved.workspace.id),
    readRegistry(resolved.redis),
  ]);
  const publication = findPublicationByWorkspace(registry, resolved.workspace.id);
  return workspaceJson({
    deployment: toDeploymentView(deployment),
    publicationLinked: Boolean(publication),
    gwapBrowser: gwapBrowserFlags(),
  });
}

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "deployment:manage");
  if (denied) return denied.error;
  if (!gwapBrowserFlags().enabled) {
    return workspaceJson({ error: "Deployment connections are not enabled yet.", code: "browser_disabled" }, 503);
  }

  const rate = await checkRateLimit(`di-workspace-deployment:${resolved.accountId}`, 30, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 8_192);
  if (!body) return workspaceJson({ error: "Invalid request" }, 400);

  const { redis, workspace, membership } = resolved;
  const result = await upsertWorkspaceDeployment(redis, {
    workspaceId: workspace.id,
    projectId: workspace.projectId,
    actorId: resolved.accountId,
    url: body.url,
    provider: body.provider,
  });
  if (!result.ok) {
    const message =
      result.reason === "invalid_provider"
        ? "Choose Vercel, Cloudflare, Netlify, or Other."
        : result.reason === "invalid_workspace"
          ? "Workspace not found"
          : describeDeploymentUrlFailure(result.reason);
    return workspaceJson({ error: message, code: result.reason }, result.reason === "invalid_workspace" ? 404 : 400);
  }

  if (result.created || result.changed) {
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: result.created ? "deployment_connected" : "deployment_updated",
      actorId: resolved.accountId,
      actorName: membership.displayName,
      summary: `${result.created ? "Connected" : "Updated"} the ${DEPLOYMENT_PROVIDER_LABELS[result.deployment.provider]} deployment`,
      metadata: { provider: result.deployment.provider },
    });
    await touchWorkspaceActivity(redis, workspace.id);
  }

  return workspaceJson({ deployment: toDeploymentView(result.deployment), created: result.created, changed: result.changed }, result.created ? 201 : 200);
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "deployment:manage");
  if (denied) return denied.error;
  // Removal is Owner-only even though Developers may connect/update.
  if (resolved.membership.role !== "owner") {
    return workspaceJson({ error: "Insufficient permissions" }, 403);
  }

  const rate = await checkRateLimit(`di-workspace-deployment:${resolved.accountId}`, 30, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const { redis, workspace, membership } = resolved;
  const registry = await readRegistry(redis);
  if (findPublicationByWorkspace(registry, workspace.id)) {
    return workspaceJson(
      { error: "Unpublish the project before removing its deployment.", code: "publication_linked" },
      409,
    );
  }

  const removed = await removeWorkspaceDeployment(redis, workspace.id);
  if (removed) {
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: "deployment_removed",
      actorId: resolved.accountId,
      actorName: membership.displayName,
      summary: "Removed the connected deployment",
    });
    await touchWorkspaceActivity(redis, workspace.id);
  }
  return workspaceJson({ removed });
}
