import type {
  SandboxCommandResult,
  SandboxExecuteInput,
  SandboxFileContent,
  SandboxFileEntry,
  SandboxFileOpInput,
  SandboxHandle,
  SandboxProvisionInput,
  SandboxRenameInput,
  SandboxWriteInput,
  WorkspaceSandboxProvider,
} from "./types.ts";
import { SandboxUnavailableError } from "./types.ts";
import { VirtualFilesystem, type VirtualNode } from "./virtual-fs.ts";

export type MemorySandboxOptions = {
  executionAvailable?: boolean;
  /** Custom command runner for tests. Return a full result or throw. */
  run?: (input: SandboxExecuteInput) => Promise<SandboxCommandResult> | SandboxCommandResult;
};

/**
 * Fully in-memory sandbox provider. Used to unit test terminal + file logic
 * without any external service, and as an injectable mock for the API layer.
 */
export class MemorySandboxProvider implements WorkspaceSandboxProvider {
  readonly id = "memory";
  readonly executionAvailable: boolean;

  private readonly filesystems = new Map<string, VirtualFilesystem>();
  private readonly options: MemorySandboxOptions;
  private counter = 0;

  constructor(options: MemorySandboxOptions = {}) {
    this.options = options;
    this.executionAvailable = options.executionAvailable ?? true;
  }

  private fs(workspaceId: string) {
    let filesystem = this.filesystems.get(workspaceId);
    if (!filesystem) {
      filesystem = new VirtualFilesystem();
      this.filesystems.set(workspaceId, filesystem);
    }
    return filesystem;
  }

  seed(workspaceId: string, nodes: VirtualNode[]) {
    this.filesystems.set(workspaceId, VirtualFilesystem.fromNodes(nodes));
  }

  async provision(input: SandboxProvisionInput): Promise<SandboxHandle> {
    const filesystem = this.fs(input.workspaceId);
    const now = new Date().toISOString();
    for (const file of input.scaffold ?? []) {
      filesystem.write(file.path, file.content, now);
    }
    this.counter += 1;
    return { sandboxId: `mem-${input.workspaceId}-${this.counter}`, status: "running" };
  }

  async start(input: { workspaceId: string; sandboxId: string }): Promise<SandboxHandle> {
    return { sandboxId: input.sandboxId, status: "running" };
  }

  async stop(): Promise<void> {
    // No-op; in-memory sandbox has nothing to tear down.
  }

  async execute(input: SandboxExecuteInput): Promise<SandboxCommandResult> {
    if (!this.executionAvailable) throw new SandboxUnavailableError();
    if (this.options.run) return this.options.run(input);
    return {
      stdout: `ran: ${input.command}`,
      stderr: "",
      exitCode: 0,
      status: "completed",
      durationMs: 1,
    };
  }

  async listFiles(input: { workspaceId: string }): Promise<SandboxFileEntry[]> {
    return this.fs(input.workspaceId).list();
  }

  async readFile(input: SandboxFileOpInput): Promise<SandboxFileContent> {
    return this.fs(input.workspaceId).read(input.path);
  }

  async writeFile(input: SandboxWriteInput): Promise<void> {
    this.fs(input.workspaceId).write(input.path, input.content, new Date().toISOString());
  }

  async createDirectory(input: SandboxFileOpInput): Promise<void> {
    this.fs(input.workspaceId).mkdir(input.path, new Date().toISOString());
  }

  async rename(input: SandboxRenameInput): Promise<void> {
    this.fs(input.workspaceId).rename(input.from, input.to, new Date().toISOString());
  }

  async delete(input: SandboxFileOpInput): Promise<void> {
    this.fs(input.workspaceId).delete(input.path);
  }
}
