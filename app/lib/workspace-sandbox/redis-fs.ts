import type { WorkspaceRedis } from "../redis.ts";
import type {
  SandboxCommandResult,
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

/**
 * Degraded-mode provider used when no execution sandbox (Daytona) is
 * configured. Files are persisted workspace-privately in Redis so the Files
 * tab and doc editing keep working; command execution is unavailable.
 */
export class RedisFilesystemProvider implements WorkspaceSandboxProvider {
  readonly id = "redis-fs";
  readonly executionAvailable = false;

  constructor(
    private readonly redis: WorkspaceRedis,
    private readonly keyFor: (workspaceId: string) => string,
  ) {}

  private async load(workspaceId: string) {
    const nodes = await this.redis.get<VirtualNode[]>(this.keyFor(workspaceId));
    return VirtualFilesystem.fromNodes(Array.isArray(nodes) ? nodes : []);
  }

  private async save(workspaceId: string, filesystem: VirtualFilesystem) {
    await this.redis.set(this.keyFor(workspaceId), filesystem.toNodes());
  }

  async provision(input: SandboxProvisionInput): Promise<SandboxHandle> {
    const filesystem = await this.load(input.workspaceId);
    const now = new Date().toISOString();
    for (const file of input.scaffold ?? []) {
      filesystem.write(file.path, file.content, now);
    }
    await this.save(input.workspaceId, filesystem);
    return { sandboxId: `local-${input.workspaceId}`, status: "unavailable" };
  }

  async start(input: { sandboxId: string }): Promise<SandboxHandle> {
    return { sandboxId: input.sandboxId, status: "unavailable" };
  }

  async stop(): Promise<void> {
    // Nothing to stop in degraded mode.
  }

  async execute(): Promise<SandboxCommandResult> {
    throw new SandboxUnavailableError();
  }

  async listFiles(input: { workspaceId: string }): Promise<SandboxFileEntry[]> {
    return (await this.load(input.workspaceId)).list();
  }

  async readFile(input: SandboxFileOpInput): Promise<SandboxFileContent> {
    return (await this.load(input.workspaceId)).read(input.path);
  }

  async writeFile(input: SandboxWriteInput): Promise<void> {
    const filesystem = await this.load(input.workspaceId);
    filesystem.write(input.path, input.content, new Date().toISOString());
    await this.save(input.workspaceId, filesystem);
  }

  async createDirectory(input: SandboxFileOpInput): Promise<void> {
    const filesystem = await this.load(input.workspaceId);
    filesystem.mkdir(input.path, new Date().toISOString());
    await this.save(input.workspaceId, filesystem);
  }

  async rename(input: SandboxRenameInput): Promise<void> {
    const filesystem = await this.load(input.workspaceId);
    filesystem.rename(input.from, input.to, new Date().toISOString());
    await this.save(input.workspaceId, filesystem);
  }

  async delete(input: SandboxFileOpInput): Promise<void> {
    const filesystem = await this.load(input.workspaceId);
    filesystem.delete(input.path);
    await this.save(input.workspaceId, filesystem);
  }
}
