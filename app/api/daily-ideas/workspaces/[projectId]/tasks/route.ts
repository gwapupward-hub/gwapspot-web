import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import {
  createWorkspaceTask,
  deleteWorkspaceTask,
  isMaterialTaskChange,
  listWorkspaceTasks,
  updateWorkspaceTask,
} from "../../../../../lib/daily-ideas-workspace-tasks.ts";
import { recordWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";
import { touchWorkspaceActivity } from "../../../../../lib/daily-ideas-collab-workspace.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "tasks:read");
  if (denied) return denied.error;

  const tasks = await listWorkspaceTasks(resolved.redis, resolved.workspace.id);
  return workspaceJson({ tasks });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "tasks:write");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-tasks:${resolved.accountId}`, 120, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 32_768);
  if (!body || typeof body.action !== "string") return workspaceJson({ error: "Invalid request" }, 400);

  const { redis, workspace, membership } = resolved;
  const actor = { actorId: resolved.accountId, actorName: membership.displayName };

  if (body.action === "create") {
    const result = await createWorkspaceTask(redis, workspace.id, resolved.accountId, {
      title: body.title,
      description: body.description,
      priority: body.priority,
      assigneeId: body.assigneeId,
      status: body.status,
    });
    if (!result.ok) return workspaceJson({ error: "Invalid task" }, 400);
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: "task_created",
      summary: `Created task “${result.task.title}”`,
      ...actor,
    });
    await touchWorkspaceActivity(redis, workspace.id);
    return workspaceJson({ task: result.task }, 201);
  }

  if (body.action === "update") {
    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? (body.patch as Record<string, unknown>) : null;
    if (!taskId || !patch) return workspaceJson({ error: "Invalid task update" }, 400);
    const result = await updateWorkspaceTask(redis, workspace.id, taskId, patch);
    if (!result.ok) {
      return workspaceJson(
        { error: result.reason === "not_found" ? "Task not found" : "Invalid task update" },
        result.reason === "not_found" ? 404 : 400,
      );
    }
    if (isMaterialTaskChange(result.previous, result.task)) {
      await recordWorkspaceActivity(redis, {
        workspaceId: workspace.id,
        type: "task_updated",
        summary: `Updated task “${result.task.title}” → ${result.task.status}`,
        ...actor,
      });
      await touchWorkspaceActivity(redis, workspace.id);
    }
    return workspaceJson({ task: result.task });
  }

  if (body.action === "delete") {
    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    if (!taskId) return workspaceJson({ error: "Invalid task" }, 400);
    const result = await deleteWorkspaceTask(redis, workspace.id, taskId);
    if (!result.ok) return workspaceJson({ error: "Task not found" }, 404);
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: "task_deleted",
      summary: `Removed task “${result.task.title}”`,
      ...actor,
    });
    await touchWorkspaceActivity(redis, workspace.id);
    return workspaceJson({ deleted: true });
  }

  return workspaceJson({ error: "Unsupported action" }, 400);
}
