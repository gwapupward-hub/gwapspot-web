import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import {
  listTerminalHistory,
  runWorkspaceCommand,
  type RunCommandResult,
} from "../../../../../lib/daily-ideas-workspace-terminal.ts";
import { recordWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";
import { touchWorkspaceActivity } from "../../../../../lib/daily-ideas-collab-workspace.ts";
import { getWorkspaceSandboxProvider } from "../../../../../lib/workspace-sandbox/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 130;

function runFailure(reason: Extract<RunCommandResult, { ok: false }>["reason"]) {
  const map: Record<typeof reason, [number, string]> = {
    empty: [400, "Enter a command"],
    too_long: [400, "Command is too long"],
    invalid: [400, "Invalid command"],
    invalid_cwd: [400, "Invalid working directory"],
    busy: [429, "Too many commands are running in this workspace. Try again shortly."],
    unavailable: [503, "Development environment unavailable"],
  };
  const [status, error] = map[reason];
  return workspaceJson({ error }, status);
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "terminal:execute");
  if (denied) return denied.error;

  const history = await listTerminalHistory(resolved.redis, resolved.workspace.id, { limit: 30 });
  return workspaceJson({
    history,
    sandbox: { status: resolved.workspace.sandbox.status, provider: resolved.workspace.sandbox.provider },
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "terminal:execute");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-terminal:${resolved.accountId}`, 40, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many commands. Slow down." }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 16_384);
  if (!body) return workspaceJson({ error: "Invalid request" }, 400);

  const provider = getWorkspaceSandboxProvider();
  const { redis, workspace, membership } = resolved;

  const result = await runWorkspaceCommand(redis, provider, {
    workspaceId: workspace.id,
    sandboxId: workspace.sandbox.sandboxId ?? "",
    actorId: resolved.accountId,
    actorName: membership.displayName,
    command: body.command,
    cwd: body.cwd,
    timeoutMs: body.timeoutMs,
  });

  if (!result.ok) return runFailure(result.reason);

  // Truthful activity: record that a command ran and its exit code — never the
  // command output (which stays out of activity, analytics, and global logs).
  await recordWorkspaceActivity(redis, {
    workspaceId: workspace.id,
    type: "command_run",
    actorId: resolved.accountId,
    actorName: membership.displayName,
    summary: `Ran a command (${result.status}${result.exitCode !== null ? `, exit ${result.exitCode}` : ""})`,
    metadata: { status: result.status, ...(result.exitCode !== null ? { exitCode: result.exitCode } : {}) },
  });
  await touchWorkspaceActivity(redis, workspace.id);

  return workspaceJson({
    entry: result.entry,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    status: result.status,
    truncated: result.truncated,
  });
}
