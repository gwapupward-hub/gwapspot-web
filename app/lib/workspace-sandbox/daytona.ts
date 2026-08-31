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
import { SandboxOperationError, SandboxUnavailableError } from "./types.ts";
import {
  looksBinary,
  toSandboxAbsolutePath,
  WORKSPACE_ROOT,
} from "../daily-ideas-workspace-core.ts";

const DEFAULT_API_URL = "https://app.daytona.io/api";
const REQUEST_TIMEOUT_MS = 20_000;

export type DaytonaProviderConfig = {
  apiKey: string;
  apiUrl?: string;
  target?: string;
  snapshot?: string;
  cpu?: number;
  memory?: number;
  disk?: number;
  autoStopIntervalMinutes?: number;
};

function toAbsolute(path: string) {
  return toSandboxAbsolutePath(path);
}

/**
 * Real Daytona provider implemented against the platform REST API + toolbox
 * proxy. Guarded by DAYTONA_API_KEY (server-only). All commands and file
 * operations run exclusively inside the isolated sandbox — never on GwapOS
 * infrastructure. This provider is exercised end-to-end only with a real key.
 */
export class DaytonaSandboxProvider implements WorkspaceSandboxProvider {
  readonly id = "daytona";
  readonly executionAvailable = true;

  private readonly baseUrl: string;

  constructor(private readonly config: DaytonaProviderConfig) {
    if (!config.apiKey) throw new SandboxUnavailableError();
    this.baseUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    init: RequestInit & { rawText?: boolean } = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
          ...(init.body && !(init.body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
          ...init.headers,
        },
        cache: "no-store",
      });

      if (response.status === 404) {
        throw new SandboxOperationError("Sandbox resource not found", "not_found");
      }
      if (!response.ok) {
        throw new SandboxOperationError(
          `Daytona request failed (${response.status})`,
          "provider_error",
        );
      }
      if (init.rawText) return (await response.text()) as unknown as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : {}) as T;
    } catch (error) {
      if (error instanceof SandboxOperationError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SandboxOperationError("Daytona request timed out", "provider_error");
      }
      throw new SandboxOperationError("Daytona request failed", "provider_error");
    } finally {
      clearTimeout(timeout);
    }
  }

  private toolboxPath(sandboxId: string, suffix: string) {
    return `/toolbox/${encodeURIComponent(sandboxId)}/toolbox${suffix}`;
  }

  async provision(input: SandboxProvisionInput): Promise<SandboxHandle> {
    const created = await this.request<{ id?: string; sandboxId?: string; state?: string }>(
      "/sandbox",
      {
        method: "POST",
        body: JSON.stringify({
          ...(this.config.snapshot ? { snapshot: this.config.snapshot } : {}),
          ...(this.config.target ? { target: this.config.target } : {}),
          cpu: this.config.cpu ?? 2,
          memory: this.config.memory ?? 4,
          disk: this.config.disk ?? 8,
          public: false,
          autoStopInterval: this.config.autoStopIntervalMinutes ?? 15,
          labels: { gwapWorkspaceId: input.workspaceId },
        }),
      },
      REQUEST_TIMEOUT_MS,
    );
    const sandboxId = created.id ?? created.sandboxId;
    if (!sandboxId) {
      throw new SandboxOperationError("Daytona did not return a sandbox id", "provider_error");
    }

    for (const file of input.scaffold ?? []) {
      await this.writeFile({ workspaceId: input.workspaceId, sandboxId, path: file.path, content: file.content });
    }
    return { sandboxId, status: "running" };
  }

  async start(input: { sandboxId: string }): Promise<SandboxHandle> {
    await this.request(`/sandbox/${encodeURIComponent(input.sandboxId)}/start`, { method: "POST" });
    return { sandboxId: input.sandboxId, status: "running" };
  }

  async stop(input: { sandboxId: string }): Promise<void> {
    await this.request(`/sandbox/${encodeURIComponent(input.sandboxId)}/stop`, { method: "POST" });
  }

  async execute(input: SandboxExecuteInput): Promise<SandboxCommandResult> {
    const startedAt = Date.now();
    const payload = await this.request<{
      exitCode?: number;
      code?: number;
      result?: string;
      stdout?: string;
      stderr?: string;
      output?: string;
    }>(
      this.toolboxPath(input.sandboxId, "/process/execute"),
      {
        method: "POST",
        body: JSON.stringify({
          command: input.command,
          cwd: input.cwd || WORKSPACE_ROOT,
          timeout: Math.ceil(input.timeoutMs / 1000),
        }),
        signal: input.signal,
      },
      input.timeoutMs + 5_000,
    );

    const exitCode =
      typeof payload.exitCode === "number"
        ? payload.exitCode
        : typeof payload.code === "number"
          ? payload.code
          : null;
    const stdout = payload.stdout ?? payload.result ?? payload.output ?? "";
    const stderr = payload.stderr ?? "";
    return {
      stdout,
      stderr,
      exitCode,
      status: exitCode === 0 ? "completed" : "failed",
      durationMs: Date.now() - startedAt,
    };
  }

  async listFiles(input: { sandboxId: string }): Promise<SandboxFileEntry[]> {
    const entries = await this.request<
      Array<{ name?: string; path?: string; isDir?: boolean; is_dir?: boolean; size?: number; modTime?: string }>
    >(
      `${this.toolboxPath(input.sandboxId, "/files")}?path=${encodeURIComponent(WORKSPACE_ROOT)}`,
    );
    if (!Array.isArray(entries)) return [];
    return entries.flatMap<SandboxFileEntry>((entry) => {
      const absolute = entry.path ?? (entry.name ? `${WORKSPACE_ROOT}/${entry.name}` : "");
      const relative = absolute.startsWith(`${WORKSPACE_ROOT}/`)
        ? absolute.slice(WORKSPACE_ROOT.length + 1)
        : entry.name ?? "";
      if (!relative) return [];
      const isDir = entry.isDir ?? entry.is_dir ?? false;
      return [
        {
          path: relative,
          name: entry.name ?? relative.split("/").pop() ?? relative,
          kind: isDir ? "dir" : "file",
          size: entry.size,
          updatedAt: entry.modTime,
        },
      ];
    });
  }

  async readFile(input: SandboxFileOpInput): Promise<SandboxFileContent> {
    const content = await this.request<string>(
      `${this.toolboxPath(input.sandboxId, "/files/download")}?path=${encodeURIComponent(toAbsolute(input.path))}`,
      { rawText: true },
    );
    return {
      path: input.path,
      content,
      binary: looksBinary(content),
      size: Buffer.byteLength(content, "utf8"),
    };
  }

  async writeFile(input: SandboxWriteInput): Promise<void> {
    const form = new FormData();
    form.append("path", toAbsolute(input.path));
    form.append("file", new Blob([input.content], { type: "text/plain" }), input.path.split("/").pop() || "file");
    await this.request(this.toolboxPath(input.sandboxId, "/files/upload"), {
      method: "POST",
      body: form,
    });
  }

  async createDirectory(input: SandboxFileOpInput): Promise<void> {
    await this.request(
      `${this.toolboxPath(input.sandboxId, "/files/folder")}?path=${encodeURIComponent(toAbsolute(input.path))}&mode=0755`,
      { method: "POST" },
    );
  }

  async rename(input: SandboxRenameInput): Promise<void> {
    await this.request(
      `${this.toolboxPath(input.sandboxId, "/files/move")}?source=${encodeURIComponent(toAbsolute(input.from))}&destination=${encodeURIComponent(toAbsolute(input.to))}`,
      { method: "POST" },
    );
  }

  async delete(input: SandboxFileOpInput): Promise<void> {
    await this.request(
      `${this.toolboxPath(input.sandboxId, "/files")}?path=${encodeURIComponent(toAbsolute(input.path))}`,
      { method: "DELETE" },
    );
  }
}
