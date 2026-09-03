import {
  loadWorkspaceContext,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import { listWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "activity:read");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-activity:${resolved.accountId}`, 120, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const params = new URL(request.url).searchParams;
  const offset = Number(params.get("offset") ?? "0");
  const limit = Number(params.get("limit") ?? "20");
  const activity = await listWorkspaceActivity(resolved.redis, resolved.workspace.id, {
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 20,
  });
  return workspaceJson({ activity });
}
