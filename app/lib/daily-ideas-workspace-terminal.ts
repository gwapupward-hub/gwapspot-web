import { randomBytes } from "node:crypto";
import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import {
  clampTerminalTimeout,
  normalizeWorkspacePath,
  TERMINAL_HARD_TIMEOUT_MS,
  TERMINAL_MAX_CONCURRENT,
  toSandboxAbsolutePath,
  truncateOutput,
  validateTerminalCommand,
  type WorkspaceTerminalEntry,
} from "./daily-ideas-workspace-core.ts";
import type { WorkspaceSandboxProvider } from "./workspace-sandbox/types.ts";
import { SandboxUnavailableError } from "./workspace-sandbox/types.ts";

const MAX_TERMINAL_HISTORY = 200;

function historyKey(workspaceId: string) {
  return workspaceStorageKey("di-workspace-terminal", workspaceId);
}
function slotKey(workspaceId: string, slot: number) {
  return workspaceStorageKey("di-workspace-cmd-slot", `${workspaceId}:${slot}`);
}

function normalizeHistory(value: unknown): WorkspaceTerminalEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is WorkspaceTerminalEntry =>
      Boolean(item) && typeof item === "object" && typeof (item as WorkspaceTerminalEntry).id === "string",
  );
}

async function acquireCommandSlot(redis: WorkspaceRedis, workspaceId: string) {
  const token = randomBytes(12).toString("base64url");
  const ttl = Math.ceil(TERMINAL_HARD_TIMEOUT_MS / 1000) + 5;
  for (let slot = 0; slot < TERMINAL_MAX_CONCURRENT; slot += 1) {
    const acquired = await redis.setIfAbsent(slotKey(workspaceId, slot), token, ttl);
    if (acquired) return { slot, token };
  }
  return null;
}

async function releaseCommandSlot(
  redis: WorkspaceRedis,
  workspaceId: string,
  slot: number,
  token: string,
) {
  await redis.deleteIfValue(slotKey(workspaceId, slot), token).catch(() => false);
}

export type RunCommandResult =
  | {
      ok: true;
      entry: WorkspaceTerminalEntry;
      stdout: string;
      stderr: string;
      exitCode: number | null;
      status: WorkspaceTerminalEntry["status"];
      truncated: boolean;
    }
  | { ok: false; reason: "empty" | "too_long" | "invalid" | "invalid_cwd" | "busy" | "unavailable" };

export type RunCommandInput = {
  workspaceId: string;
  sandboxId: string;
  actorId: string;
  actorName: string;
  command: unknown;
  cwd?: unknown;
  timeoutMs?: unknown;
};

/**
 * Executes a single command inside the workspace's isolated sandbox with the
 * full guardrail set: length/timeout caps, per-workspace concurrency limits,
 * bounded output, and safe metadata persistence. Never runs on GwapOS infra.
 */
export async function runWorkspaceCommand(
  redis: WorkspaceRedis,
  provider: WorkspaceSandboxProvider,
  input: RunCommandInput,
): Promise<RunCommandResult> {
  if (!provider.executionAvailable) return { ok: false, reason: "unavailable" };

  const validation = validateTerminalCommand(input.command);
  if (!validation.ok) return { ok: false, reason: validation.reason };

  const cwdRelative = input.cwd === undefined || input.cwd === "" ? "" : normalizeWorkspacePath(input.cwd);
  if (cwdRelative === null) return { ok: false, reason: "invalid_cwd" };
  const cwd = toSandboxAbsolutePath(cwdRelative);
  const timeoutMs = clampTerminalTimeout(input.timeoutMs);

  const lease = await acquireCommandSlot(redis, input.workspaceId);
  if (!lease) return { ok: false, reason: "busy" };

  const startedAt = new Date();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let status: WorkspaceTerminalEntry["status"] = "completed";

    type ExecOutcome =
      | { kind: "result"; result: Awaited<ReturnType<WorkspaceSandboxProvider["execute"]>> }
      | { kind: "error"; error: unknown }
      | { kind: "timeout" };

    const execution: Promise<ExecOutcome> = provider
      .execute({
        workspaceId: input.workspaceId,
        sandboxId: input.sandboxId,
        command: validation.command,
        cwd,
        timeoutMs,
        signal: controller.signal,
      })
      .then((result) => ({ kind: "result" as const, result }))
      .catch((error) => ({ kind: "error" as const, error }));

    // Race execution against the abort signal so a hung command cannot block the
    // request past the hard timeout, even if the provider ignores the signal.
    const abortWait = new Promise<ExecOutcome>((resolve) => {
      if (controller.signal.aborted) resolve({ kind: "timeout" });
      else controller.signal.addEventListener("abort", () => resolve({ kind: "timeout" }), { once: true });
    });

    const outcome = await Promise.race([execution, abortWait]);
    if (outcome.kind === "result") {
      stdout = outcome.result.stdout;
      stderr = outcome.result.stderr;
      exitCode = outcome.result.exitCode;
      status = outcome.result.status;
    } else if (outcome.kind === "error") {
      if (outcome.error instanceof SandboxUnavailableError) {
        return { ok: false, reason: "unavailable" };
      }
      status = "error";
    } else {
      status = "timeout";
    }

    if (timedOut) status = "timeout";

    const endedAt = new Date();
    const boundedStdout = truncateOutput(stdout);
    const boundedStderr = truncateOutput(stderr);
    const truncated = boundedStdout.truncated || boundedStderr.truncated;

    const entry: WorkspaceTerminalEntry = {
      id: `cmd_${randomBytes(9).toString("base64url")}`,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      actorName: input.actorName.slice(0, 120),
      command: validation.command.slice(0, 4096),
      cwd,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      exitCode,
      status,
      durationMs: endedAt.getTime() - startedAt.getTime(),
    };

    // Persist metadata only — never the command output — to keep terminal I/O
    // out of shared logs/analytics.
    const history = normalizeHistory(await redis.get<WorkspaceTerminalEntry[]>(historyKey(input.workspaceId)));
    await redis.set(historyKey(input.workspaceId), [entry, ...history].slice(0, MAX_TERMINAL_HISTORY));

    return {
      ok: true,
      entry,
      stdout: boundedStdout.output,
      stderr: boundedStderr.output,
      exitCode,
      status,
      truncated,
    };
  } finally {
    clearTimeout(timer);
    await releaseCommandSlot(redis, input.workspaceId, lease.slot, lease.token);
  }
}

export async function listTerminalHistory(
  redis: WorkspaceRedis,
  workspaceId: string,
  input: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 25)));
  const history = normalizeHistory(await redis.get<WorkspaceTerminalEntry[]>(historyKey(workspaceId)));
  const items = history.slice(offset, offset + limit);
  const nextOffset = offset + items.length < history.length ? offset + items.length : null;
  return { items, total: history.length, offset, limit, nextOffset };
}
