import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../../lib/daily-ideas-workspace-server.ts";
import { auditAuthEvent, checkRateLimit } from "../../../../../../lib/request-guard.ts";
import { recordWorkspaceActivity } from "../../../../../../lib/daily-ideas-workspace-activity.ts";
import { touchWorkspaceActivity } from "../../../../../../lib/daily-ideas-collab-workspace.ts";
import { unpublishWorkspaceProject } from "../../../../../../lib/gwap-browser-registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unpublishing is deliberately not feature-flag gated: an owner must always be
// able to withdraw a publication, including during a flagged-off rollback.
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "publication:manage");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-publish:${resolved.accountId}`, 10, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }
  await readWorkspaceBody(request, 1_024).catch(() => null);

  const { redis, workspace, membership, identity } = resolved;
  const result = await unpublishWorkspaceProject(redis, { workspaceId: workspace.id });
  if (!result.ok) {
    return workspaceJson({ error: "The registry is busy. Try again in a moment.", code: "lock_busy" }, 409, { "Retry-After": "2" });
  }

  if (result.removed && result.publication) {
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: "publication_unpublished",
      actorId: resolved.accountId,
      actorName: membership.displayName,
      summary: `Unpublished ${result.publication.address}`,
      metadata: { routeReset: result.routeReset },
    });
    await touchWorkspaceActivity(redis, workspace.id);
    auditAuthEvent("gwap-browser.unpublish", identity.userId, "success");
  }

  return workspaceJson({ unpublished: result.removed, routeReset: result.routeReset });
}
