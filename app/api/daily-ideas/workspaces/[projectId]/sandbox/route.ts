import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import { updateWorkspaceSandboxState } from "../../../../../lib/daily-ideas-collab-workspace.ts";
import { recordWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";
import {
  getWorkspaceSandboxProvider,
  isSandboxExecutionConfigured,
} from "../../../../../lib/workspace-sandbox/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  return workspaceJson({
    sandbox: resolved.workspace.sandbox,
    executionConfigured: isSandboxExecutionConfigured(),
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "sandbox:manage");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-sandbox:${resolved.accountId}`, 15, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 4_096);
  const action = body?.action;
  const { redis, workspace, membership } = resolved;
  const provider = getWorkspaceSandboxProvider();

  if (!provider.executionAvailable) {
    return workspaceJson({ error: "Development environment unavailable", sandbox: workspace.sandbox }, 503);
  }

  try {
    if (action === "start") {
      const handle = workspace.sandbox.sandboxId
        ? await provider.start({ workspaceId: workspace.id, sandboxId: workspace.sandbox.sandboxId })
        : await provider.provision({ workspaceId: workspace.id });
      const next = await updateWorkspaceSandboxState(redis, workspace.id, {
        provider: provider.id,
        sandboxId: handle.sandboxId,
        status: handle.status,
        updatedAt: new Date().toISOString(),
      });
      await recordWorkspaceActivity(redis, {
        workspaceId: workspace.id,
        type: "sandbox_started",
        actorId: resolved.accountId,
        actorName: membership.displayName,
        summary: "Started the development sandbox",
      });
      return workspaceJson({ sandbox: next?.sandbox });
    }

    if (action === "stop") {
      if (workspace.sandbox.sandboxId) {
        await provider.stop({ workspaceId: workspace.id, sandboxId: workspace.sandbox.sandboxId });
      }
      // Stopping never deletes the workspace or its sandbox association.
      const next = await updateWorkspaceSandboxState(redis, workspace.id, {
        ...workspace.sandbox,
        status: "stopped",
        updatedAt: new Date().toISOString(),
      });
      await recordWorkspaceActivity(redis, {
        workspaceId: workspace.id,
        type: "sandbox_stopped",
        actorId: resolved.accountId,
        actorName: membership.displayName,
        summary: "Stopped the development sandbox",
      });
      return workspaceJson({ sandbox: next?.sandbox });
    }

    return workspaceJson({ error: "Unsupported action" }, 400);
  } catch {
    await updateWorkspaceSandboxState(redis, workspace.id, {
      ...workspace.sandbox,
      status: "error",
      updatedAt: new Date().toISOString(),
    });
    return workspaceJson({ error: "The sandbox operation could not be completed" }, 503);
  }
}
