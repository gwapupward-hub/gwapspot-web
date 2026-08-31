import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import {
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  listWorkspaceFiles,
  readWorkspaceFile,
  renameWorkspaceEntry,
  requiredFileWriteCapability,
  writeWorkspaceFile,
  type FileOpFailure,
} from "../../../../../lib/daily-ideas-workspace-files.ts";
import { recordWorkspaceActivity } from "../../../../../lib/daily-ideas-workspace-activity.ts";
import { touchWorkspaceActivity } from "../../../../../lib/daily-ideas-collab-workspace.ts";
import { can, type WorkspaceActivityType } from "../../../../../lib/daily-ideas-workspace-core.ts";
import { getWorkspaceSandboxProvider } from "../../../../../lib/workspace-sandbox/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failureResponse(failure: FileOpFailure) {
  const map: Record<FileOpFailure["reason"], [number, string]> = {
    invalid_path: [400, "Invalid file path"],
    not_found: [404, "File not found"],
    conflict: [409, "A file or directory already exists at that path"],
    too_large: [413, "File is too large to edit here"],
    binary: [415, "Binary files cannot be edited"],
    unavailable: [503, "Development environment unavailable"],
    provider_error: [503, "File operation failed"],
  };
  const [status, error] = map[failure.reason];
  return workspaceJson({ error }, status);
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "files:read");
  if (denied) return denied.error;

  const provider = getWorkspaceSandboxProvider();
  const target = { workspaceId: resolved.workspace.id, sandboxId: resolved.workspace.sandbox.sandboxId ?? "" };
  const path = new URL(request.url).searchParams.get("path");

  if (path) {
    const result = await readWorkspaceFile(provider, target, path);
    if (!result.ok) return failureResponse(result);
    return workspaceJson({ file: result.file, editable: result.editable });
  }

  const listing = await listWorkspaceFiles(provider, target);
  if (!listing.ok) return failureResponse(listing);
  return workspaceJson({ files: listing.files });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;

  const rate = await checkRateLimit(`di-workspace-files:${resolved.accountId}`, 120, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 1_048_576);
  if (!body || typeof body.action !== "string") return workspaceJson({ error: "Invalid request" }, 400);

  const provider = getWorkspaceSandboxProvider();
  const { redis, workspace, membership } = resolved;
  const target = { workspaceId: workspace.id, sandboxId: workspace.sandbox.sandboxId ?? "" };
  const actor = { actorId: resolved.accountId, actorName: membership.displayName };

  async function log(type: WorkspaceActivityType, summary: string) {
    await recordWorkspaceActivity(redis, { workspaceId: workspace.id, type, summary, ...actor });
    await touchWorkspaceActivity(redis, workspace.id);
  }

  if (body.action === "write") {
    const capability = requiredFileWriteCapability(body.path);
    if (!capability) return workspaceJson({ error: "Invalid file path" }, 400);
    if (!can(membership.role, capability)) return workspaceJson({ error: "Insufficient permissions" }, 403);
    const result = await writeWorkspaceFile(provider, target, body.path, body.content);
    if (!result.ok) return failureResponse(result);
    await log("file_edited", `Edited ${result.path}`);
    return workspaceJson({ path: result.path });
  }

  // Structural + destructive operations require full file-write access.
  if (!can(membership.role, "files:write")) return workspaceJson({ error: "Insufficient permissions" }, 403);

  if (body.action === "create") {
    const result = await writeWorkspaceFile(provider, target, body.path, typeof body.content === "string" ? body.content : "");
    if (!result.ok) return failureResponse(result);
    await log("file_created", `Created ${result.path}`);
    return workspaceJson({ path: result.path }, 201);
  }
  if (body.action === "mkdir") {
    const result = await createWorkspaceDirectory(provider, target, body.path);
    if (!result.ok) return failureResponse(result);
    await log("file_created", `Created directory ${result.path}`);
    return workspaceJson({ path: result.path }, 201);
  }
  if (body.action === "rename") {
    const result = await renameWorkspaceEntry(provider, target, body.from, body.to);
    if (!result.ok) return failureResponse(result);
    await log("file_edited", `Renamed ${result.from} → ${result.to}`);
    return workspaceJson({ from: result.from, to: result.to });
  }
  if (body.action === "delete") {
    const result = await deleteWorkspaceEntry(provider, target, body.path);
    if (!result.ok) return failureResponse(result);
    await log("file_deleted", `Deleted ${result.path}`);
    return workspaceJson({ deleted: true });
  }

  return workspaceJson({ error: "Unsupported action" }, 400);
}
