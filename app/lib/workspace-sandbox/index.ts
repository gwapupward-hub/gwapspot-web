import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "../redis.ts";
import { DaytonaSandboxProvider } from "./daytona.ts";
import { RedisFilesystemProvider } from "./redis-fs.ts";
import type { WorkspaceSandboxProvider } from "./types.ts";

export type { WorkspaceSandboxProvider } from "./types.ts";

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

/** True when a real execution sandbox (Daytona) is configured server-side. */
export function isSandboxExecutionConfigured() {
  return Boolean(readEnv("DAYTONA_API_KEY"));
}

function workspaceFilesystemKey(workspaceId: string) {
  return getPrivateStorageKey("di-workspace-fs", workspaceId);
}

/**
 * Returns the active sandbox provider. Daytona when configured; otherwise the
 * Redis-backed degraded provider (files work, terminal reports unavailable).
 */
export function getWorkspaceSandboxProvider(): WorkspaceSandboxProvider {
  const apiKey = readEnv("DAYTONA_API_KEY");
  if (apiKey) {
    const cpu = Number(readEnv("DAYTONA_SANDBOX_CPU") ?? "");
    const memory = Number(readEnv("DAYTONA_SANDBOX_MEMORY") ?? "");
    const disk = Number(readEnv("DAYTONA_SANDBOX_DISK") ?? "");
    const autoStop = Number(readEnv("DAYTONA_AUTO_STOP_MINUTES") ?? "");
    return new DaytonaSandboxProvider({
      apiKey,
      apiUrl: readEnv("DAYTONA_API_URL") ?? undefined,
      target: readEnv("DAYTONA_TARGET") ?? undefined,
      snapshot: readEnv("DAYTONA_SNAPSHOT") ?? undefined,
      cpu: Number.isFinite(cpu) && cpu > 0 ? cpu : undefined,
      memory: Number.isFinite(memory) && memory > 0 ? memory : undefined,
      disk: Number.isFinite(disk) && disk > 0 ? disk : undefined,
      autoStopIntervalMinutes: Number.isFinite(autoStop) && autoStop > 0 ? autoStop : undefined,
    });
  }

  return new RedisFilesystemProvider(getWorkspaceRedis(), workspaceFilesystemKey);
}
