import type {
  WorkspaceSandboxStatus,
} from "../daily-ideas-workspace-core.ts";
import type { ScaffoldFile } from "../daily-ideas-workspace-core.ts";

export type SandboxHandle = {
  sandboxId: string;
  status: WorkspaceSandboxStatus;
};

export type SandboxProvisionInput = {
  workspaceId: string;
  scaffold?: ScaffoldFile[];
};

export type SandboxCommandStatus = "completed" | "failed" | "timeout" | "error";

export type SandboxExecuteInput = {
  workspaceId: string;
  sandboxId: string;
  command: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type SandboxCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: SandboxCommandStatus;
  durationMs: number;
};

export type SandboxFileEntry = {
  path: string;
  name: string;
  kind: "file" | "dir";
  size?: number;
  updatedAt?: string;
};

export type SandboxFileContent = {
  path: string;
  content: string;
  binary: boolean;
  size: number;
};

export type SandboxFileOpInput = {
  workspaceId: string;
  sandboxId: string;
  path: string;
};

export type SandboxWriteInput = SandboxFileOpInput & { content: string };

export type SandboxRenameInput = {
  workspaceId: string;
  sandboxId: string;
  from: string;
  to: string;
};

/**
 * Provider-neutral contract for a workspace's isolated development environment.
 * The rest of GwapOS depends only on this interface so the concrete provider
 * (Daytona today) can be replaced without touching product code.
 */
export interface WorkspaceSandboxProvider {
  readonly id: string;
  /** Whether this provider can execute shell commands (false = degraded mode). */
  readonly executionAvailable: boolean;

  provision(input: SandboxProvisionInput): Promise<SandboxHandle>;
  start(input: { workspaceId: string; sandboxId: string }): Promise<SandboxHandle>;
  stop(input: { workspaceId: string; sandboxId: string }): Promise<void>;
  execute(input: SandboxExecuteInput): Promise<SandboxCommandResult>;

  listFiles(input: { workspaceId: string; sandboxId: string }): Promise<SandboxFileEntry[]>;
  readFile(input: SandboxFileOpInput): Promise<SandboxFileContent>;
  writeFile(input: SandboxWriteInput): Promise<void>;
  createDirectory(input: SandboxFileOpInput): Promise<void>;
  rename(input: SandboxRenameInput): Promise<void>;
  delete(input: SandboxFileOpInput): Promise<void>;
}

export class SandboxUnavailableError extends Error {
  constructor(message = "Development environment unavailable") {
    super(message);
    this.name = "SandboxUnavailableError";
  }
}

export type SandboxOperationCode =
  | "not_found"
  | "conflict"
  | "invalid"
  | "provider_error";

export class SandboxOperationError extends Error {
  readonly code: SandboxOperationCode;

  constructor(message: string, code: SandboxOperationCode = "provider_error") {
    super(message);
    this.name = "SandboxOperationError";
    this.code = code;
  }
}
