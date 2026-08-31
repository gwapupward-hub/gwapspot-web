import {
  isLikelyEditableTextPath,
  looksBinary,
  MAX_EDITABLE_FILE_BYTES,
  normalizeWorkspacePath,
  type WorkspaceCapability,
  fileWriteCapabilityFor,
} from "./daily-ideas-workspace-core.ts";
import type {
  SandboxFileContent,
  SandboxFileEntry,
  WorkspaceSandboxProvider,
} from "./workspace-sandbox/types.ts";
import {
  SandboxOperationError,
  SandboxUnavailableError,
} from "./workspace-sandbox/types.ts";

export type FileOpFailure =
  | { ok: false; reason: "invalid_path" }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "too_large" }
  | { ok: false; reason: "binary" }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "provider_error" };

type Target = { workspaceId: string; sandboxId: string };

function mapProviderError(error: unknown): FileOpFailure {
  if (error instanceof SandboxUnavailableError) return { ok: false, reason: "unavailable" };
  if (error instanceof SandboxOperationError) {
    if (error.code === "not_found") return { ok: false, reason: "not_found" };
    if (error.code === "conflict") return { ok: false, reason: "conflict" };
    if (error.code === "invalid") return { ok: false, reason: "invalid_path" };
  }
  return { ok: false, reason: "provider_error" };
}

/** Determines the capability required to write a raw (unvalidated) path. */
export function requiredFileWriteCapability(rawPath: unknown): WorkspaceCapability | null {
  const normalized = normalizeWorkspacePath(rawPath);
  if (normalized === null || normalized === "") return null;
  return fileWriteCapabilityFor(normalized);
}

export async function listWorkspaceFiles(
  provider: WorkspaceSandboxProvider,
  target: Target,
): Promise<{ ok: true; files: SandboxFileEntry[] } | FileOpFailure> {
  try {
    const files = await provider.listFiles(target);
    return { ok: true, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  } catch (error) {
    return mapProviderError(error);
  }
}

export async function readWorkspaceFile(
  provider: WorkspaceSandboxProvider,
  target: Target,
  rawPath: unknown,
): Promise<{ ok: true; file: SandboxFileContent; editable: boolean } | FileOpFailure> {
  const path = normalizeWorkspacePath(rawPath);
  if (path === null || path === "") return { ok: false, reason: "invalid_path" };
  try {
    const file = await provider.readFile({ ...target, path });
    const editable =
      !file.binary &&
      isLikelyEditableTextPath(path) &&
      file.size <= MAX_EDITABLE_FILE_BYTES;
    return { ok: true, file, editable };
  } catch (error) {
    return mapProviderError(error);
  }
}

export async function writeWorkspaceFile(
  provider: WorkspaceSandboxProvider,
  target: Target,
  rawPath: unknown,
  content: unknown,
): Promise<{ ok: true; path: string } | FileOpFailure> {
  const path = normalizeWorkspacePath(rawPath);
  if (path === null || path === "") return { ok: false, reason: "invalid_path" };
  if (typeof content !== "string") return { ok: false, reason: "invalid_path" };
  if (Buffer.byteLength(content, "utf8") > MAX_EDITABLE_FILE_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  if (looksBinary(content)) return { ok: false, reason: "binary" };
  try {
    await provider.writeFile({ ...target, path, content });
    return { ok: true, path };
  } catch (error) {
    return mapProviderError(error);
  }
}

export async function createWorkspaceDirectory(
  provider: WorkspaceSandboxProvider,
  target: Target,
  rawPath: unknown,
): Promise<{ ok: true; path: string } | FileOpFailure> {
  const path = normalizeWorkspacePath(rawPath);
  if (path === null || path === "") return { ok: false, reason: "invalid_path" };
  try {
    await provider.createDirectory({ ...target, path });
    return { ok: true, path };
  } catch (error) {
    return mapProviderError(error);
  }
}

export async function renameWorkspaceEntry(
  provider: WorkspaceSandboxProvider,
  target: Target,
  rawFrom: unknown,
  rawTo: unknown,
): Promise<{ ok: true; from: string; to: string } | FileOpFailure> {
  const from = normalizeWorkspacePath(rawFrom);
  const to = normalizeWorkspacePath(rawTo);
  if (from === null || from === "" || to === null || to === "") {
    return { ok: false, reason: "invalid_path" };
  }
  try {
    await provider.rename({ ...target, from, to });
    return { ok: true, from, to };
  } catch (error) {
    return mapProviderError(error);
  }
}

export async function deleteWorkspaceEntry(
  provider: WorkspaceSandboxProvider,
  target: Target,
  rawPath: unknown,
): Promise<{ ok: true; path: string } | FileOpFailure> {
  const path = normalizeWorkspacePath(rawPath);
  if (path === null || path === "") return { ok: false, reason: "invalid_path" };
  try {
    await provider.delete({ ...target, path });
    return { ok: true, path };
  } catch (error) {
    return mapProviderError(error);
  }
}
