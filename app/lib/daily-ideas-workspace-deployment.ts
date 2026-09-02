import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import { isProjectId, isWorkspaceId } from "./daily-ideas-workspace-core.ts";
import {
  DEPLOYMENT_ID_PATTERN,
  deploymentHash,
  deriveDeploymentId,
  inferDeploymentProvider,
  isDeploymentProvider,
  validateDeploymentUrl,
  type DeploymentUrlFailure,
  type WorkspaceDeploymentProvider,
  type WorkspaceDeploymentRecord,
} from "./gwap-browser-core.ts";

// ---------------------------------------------------------------------------
// Workspace deployment connection — stored separately from WorkspaceRecord so
// no workspace schema migration is needed. One record per workspace. V1 stores
// a syntax-validated, user-attested HTTPS target; it never fetches the URL and
// never stores provider credentials, tokens, or deployment logs.
// ---------------------------------------------------------------------------

function deploymentKey(workspaceId: string) {
  return workspaceStorageKey("di-workspace-deployment", workspaceId);
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Strict normalizer: corrupt records are rejected, never coerced. */
export function normalizeDeploymentRecord(value: unknown): WorkspaceDeploymentRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<WorkspaceDeploymentRecord>;
  if (
    typeof candidate.id !== "string" ||
    !DEPLOYMENT_ID_PATTERN.test(candidate.id) ||
    !isWorkspaceId(candidate.workspaceId) ||
    !isProjectId(candidate.projectId) ||
    !isDeploymentProvider(candidate.provider) ||
    candidate.status !== "configured" ||
    typeof candidate.createdBy !== "string" ||
    typeof candidate.updatedBy !== "string" ||
    !isIso(candidate.createdAt) ||
    !isIso(candidate.updatedAt) ||
    candidate.schemaVersion !== 1
  ) {
    return null;
  }
  if (candidate.id !== deriveDeploymentId(candidate.workspaceId)) return null;
  const url = validateDeploymentUrl(candidate.url);
  if (!url.ok || url.url !== candidate.url) return null;
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    projectId: candidate.projectId,
    provider: candidate.provider,
    url: candidate.url,
    status: "configured",
    createdBy: candidate.createdBy,
    createdAt: candidate.createdAt,
    updatedBy: candidate.updatedBy,
    updatedAt: candidate.updatedAt,
    schemaVersion: 1,
  };
}

export async function getWorkspaceDeployment(redis: WorkspaceRedis, workspaceId: string) {
  if (!isWorkspaceId(workspaceId)) return null;
  return normalizeDeploymentRecord(await redis.get<WorkspaceDeploymentRecord>(deploymentKey(workspaceId)));
}

export type UpsertDeploymentInput = {
  workspaceId: string;
  projectId: string;
  actorId: string;
  url: unknown;
  provider?: unknown;
  now?: string;
};

export type UpsertDeploymentResult =
  | { ok: true; created: boolean; changed: boolean; deployment: WorkspaceDeploymentRecord }
  | { ok: false; reason: DeploymentUrlFailure | "invalid_provider" | "invalid_workspace" };

/**
 * Connects (or updates) the workspace's live deployment. Provider defaults to
 * a deterministic inference from the hostname when omitted. Idempotent: the
 * same URL + provider leaves the record untouched except `updatedAt`.
 */
export async function upsertWorkspaceDeployment(
  redis: WorkspaceRedis,
  input: UpsertDeploymentInput,
): Promise<UpsertDeploymentResult> {
  if (!isWorkspaceId(input.workspaceId) || !isProjectId(input.projectId)) {
    return { ok: false, reason: "invalid_workspace" };
  }
  const url = validateDeploymentUrl(input.url);
  if (!url.ok) return { ok: false, reason: url.reason };

  let provider: WorkspaceDeploymentProvider;
  if (input.provider === undefined || input.provider === null || input.provider === "") {
    provider = inferDeploymentProvider(url.host);
  } else if (isDeploymentProvider(input.provider)) {
    provider = input.provider;
  } else {
    return { ok: false, reason: "invalid_provider" };
  }

  const now = input.now ?? new Date().toISOString();
  const existing = await getWorkspaceDeployment(redis, input.workspaceId);
  const changed = !existing || existing.url !== url.url || existing.provider !== provider;

  const deployment: WorkspaceDeploymentRecord = {
    id: deriveDeploymentId(input.workspaceId),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    provider,
    url: url.url,
    status: "configured",
    createdBy: existing?.createdBy ?? input.actorId,
    createdAt: existing?.createdAt ?? now,
    updatedBy: input.actorId,
    updatedAt: now,
    schemaVersion: 1,
  };
  await redis.set(deploymentKey(input.workspaceId), deployment);
  return { ok: true, created: !existing, changed, deployment };
}

export async function removeWorkspaceDeployment(redis: WorkspaceRedis, workspaceId: string) {
  if (!isWorkspaceId(workspaceId)) return false;
  const existing = await getWorkspaceDeployment(redis, workspaceId);
  if (!existing) return false;
  await redis.del(deploymentKey(workspaceId));
  return true;
}

/** Change-detection hash for the currently connected deployment. */
export function currentDeploymentHash(deployment: WorkspaceDeploymentRecord) {
  return deploymentHash(deployment.provider, deployment.url);
}

/** The shape the workspace API returns to members. Never includes secrets. */
export function toDeploymentView(deployment: WorkspaceDeploymentRecord | null) {
  if (!deployment) return null;
  return {
    id: deployment.id,
    provider: deployment.provider,
    url: deployment.url,
    host: new URL(deployment.url).hostname,
    status: deployment.status,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
    updatedBy: deployment.updatedBy,
  };
}
