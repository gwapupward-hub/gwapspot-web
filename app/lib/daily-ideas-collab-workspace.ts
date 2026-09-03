import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import {
  buildWorkspaceScaffold,
  deriveWorkspaceId,
  isWorkspaceId,
  type ScaffoldProjectInput,
  type WorkspaceMember,
  type WorkspaceRecord,
  type WorkspaceSandboxState,
  type WorkspaceStage,
} from "./daily-ideas-workspace-core.ts";
import {
  getWorkspaceMember,
  listAccountWorkspaces,
  upsertWorkspaceMember,
} from "./daily-ideas-workspace-members.ts";
import { seedWorkspaceTasksIfEmpty } from "./daily-ideas-workspace-tasks.ts";
import { recordWorkspaceActivity } from "./daily-ideas-workspace-activity.ts";
import {
  consumeWorkspaceInvite,
  peekWorkspaceInvite,
} from "./daily-ideas-workspace-invites.ts";
import { isValidInviteToken } from "./daily-ideas-workspace-core.ts";
import type { WorkspaceSandboxProvider } from "./workspace-sandbox/types.ts";

function workspaceKey(workspaceId: string) {
  return workspaceStorageKey("di-workspace", workspaceId);
}

function normalizeSandbox(value: unknown): WorkspaceSandboxState {
  const candidate = (value ?? {}) as Partial<WorkspaceSandboxState>;
  return {
    provider: typeof candidate.provider === "string" ? candidate.provider : null,
    sandboxId: typeof candidate.sandboxId === "string" ? candidate.sandboxId : null,
    status:
      candidate.status === "provisioning" ||
      candidate.status === "running" ||
      candidate.status === "stopped" ||
      candidate.status === "error" ||
      candidate.status === "unavailable"
        ? candidate.status
        : "none",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
  };
}

function normalizeWorkspace(value: unknown): WorkspaceRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WorkspaceRecord>;
  if (
    !isWorkspaceId(candidate.id) ||
    typeof candidate.projectId !== "string" ||
    typeof candidate.ownerAccountId !== "string"
  ) {
    return null;
  }
  return {
    id: candidate.id,
    projectId: candidate.projectId,
    ideaId: typeof candidate.ideaId === "string" ? candidate.ideaId : "",
    ownerAccountId: candidate.ownerAccountId,
    title: typeof candidate.title === "string" ? candidate.title : "Untitled workspace",
    summary: typeof candidate.summary === "string" ? candidate.summary : "",
    category: typeof candidate.category === "string" ? candidate.category : "general",
    stage: (candidate.stage as WorkspaceStage) ?? "building",
    status: candidate.status === "archived" ? "archived" : "active",
    sandbox: normalizeSandbox(candidate.sandbox),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date(0).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
    lastActivityAt:
      typeof candidate.lastActivityAt === "string" ? candidate.lastActivityAt : new Date(0).toISOString(),
    schemaVersion: 1,
  };
}

export async function getWorkspaceById(redis: WorkspaceRedis, workspaceId: string) {
  if (!isWorkspaceId(workspaceId)) return null;
  return normalizeWorkspace(await redis.get<WorkspaceRecord>(workspaceKey(workspaceId)));
}

export type WorkspaceAccess = {
  workspace: WorkspaceRecord;
  membership: WorkspaceMember;
};

/**
 * Resolves the workspace a given account may access for a projectId, together
 * with their membership. Returns null when no accessible workspace exists —
 * callers should return 404 rather than leaking existence to unrelated accounts.
 */
export async function resolveWorkspaceForAccount(
  redis: WorkspaceRedis,
  projectId: string,
  accountId: string,
): Promise<WorkspaceAccess | null> {
  // Owner fast-path: the id is derivable from (owner, project).
  const ownerWorkspaceId = deriveWorkspaceId(accountId, projectId);
  const ownerWorkspace = await getWorkspaceById(redis, ownerWorkspaceId);
  if (ownerWorkspace && ownerWorkspace.ownerAccountId === accountId) {
    const membership = await getWorkspaceMember(redis, ownerWorkspace.id, accountId);
    if (membership) return { workspace: ownerWorkspace, membership };
  }

  // Collaborator path: resolve via the account's membership index.
  const refs = await listAccountWorkspaces(redis, accountId);
  const ref = refs.find((entry) => entry.projectId === projectId);
  if (!ref) return null;
  const workspace = await getWorkspaceById(redis, ref.workspaceId);
  if (!workspace) return null;
  const membership = await getWorkspaceMember(redis, workspace.id, accountId);
  if (!membership) return null;
  return { workspace, membership };
}

export type CreateWorkspaceInput = {
  projectId: string;
  ideaId: string;
  ownerAccountId: string;
  title: string;
  summary: string;
  category: string;
  stage: WorkspaceStage;
  buildRoadmap: string[];
  firstAction: string;
  scaffoldProject: ScaffoldProjectInput;
  owner: {
    displayName: string;
    wallet: string | null;
    gnsIdentity: string | null;
  };
};

export type CreateWorkspaceResult = {
  created: boolean;
  workspace: WorkspaceRecord;
  membership: WorkspaceMember;
};

/** Idempotently creates the single collaborative workspace for a project. */
export async function createWorkspace(
  redis: WorkspaceRedis,
  provider: WorkspaceSandboxProvider,
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const workspaceId = deriveWorkspaceId(input.ownerAccountId, input.projectId);
  const existing = await getWorkspaceById(redis, workspaceId);
  const now = new Date().toISOString();

  const ownerMember: WorkspaceMember = {
    accountId: input.ownerAccountId,
    role: "owner",
    displayName: input.owner.displayName.slice(0, 120) || "Owner",
    wallet: input.owner.wallet,
    gnsIdentity: input.owner.gnsIdentity,
    invitedBy: null,
    joinedAt: existing?.createdAt ?? now,
  };

  if (existing) {
    // Backfill owner membership + seed tasks defensively; both are idempotent.
    await upsertWorkspaceMember(redis, workspaceId, ownerMember, {
      projectId: existing.projectId,
      ownerAccountId: existing.ownerAccountId,
      title: existing.title,
    });
    await seedWorkspaceTasksIfEmpty(redis, {
      workspaceId,
      createdBy: input.ownerAccountId,
      buildRoadmap: input.buildRoadmap,
      firstAction: input.firstAction,
    });
    return { created: false, workspace: existing, membership: ownerMember };
  }

  let sandbox: WorkspaceSandboxState = {
    provider: provider.id,
    sandboxId: null,
    status: provider.executionAvailable ? "none" : "unavailable",
    updatedAt: now,
  };
  try {
    const scaffold = buildWorkspaceScaffold(input.scaffoldProject);
    const handle = await provider.provision({ workspaceId, scaffold });
    sandbox = {
      provider: provider.id,
      sandboxId: handle.sandboxId,
      status: handle.status,
      updatedAt: now,
    };
  } catch {
    sandbox = {
      provider: provider.id,
      sandboxId: null,
      status: provider.executionAvailable ? "error" : "unavailable",
      updatedAt: now,
    };
  }

  const workspace: WorkspaceRecord = {
    id: workspaceId,
    projectId: input.projectId,
    ideaId: input.ideaId,
    ownerAccountId: input.ownerAccountId,
    title: input.title.slice(0, 160) || "Untitled workspace",
    summary: input.summary.slice(0, 600),
    category: input.category.slice(0, 60) || "general",
    stage: input.stage,
    status: "active",
    sandbox,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    schemaVersion: 1,
  };

  await redis.set(workspaceKey(workspaceId), workspace);
  await upsertWorkspaceMember(redis, workspaceId, ownerMember, {
    projectId: workspace.projectId,
    ownerAccountId: workspace.ownerAccountId,
    title: workspace.title,
  });
  await seedWorkspaceTasksIfEmpty(redis, {
    workspaceId,
    createdBy: input.ownerAccountId,
    buildRoadmap: input.buildRoadmap,
    firstAction: input.firstAction,
    now,
  });
  await recordWorkspaceActivity(redis, {
    workspaceId,
    type: "workspace_created",
    actorId: input.ownerAccountId,
    actorName: ownerMember.displayName,
    summary: `Created the ${workspace.title} workspace`,
    now,
  });

  return { created: true, workspace, membership: ownerMember };
}

export async function saveWorkspace(redis: WorkspaceRedis, workspace: WorkspaceRecord) {
  await redis.set(workspaceKey(workspace.id), { ...workspace, updatedAt: new Date().toISOString() });
}

export async function updateWorkspaceSandboxState(
  redis: WorkspaceRedis,
  workspaceId: string,
  sandbox: WorkspaceSandboxState,
) {
  const workspace = await getWorkspaceById(redis, workspaceId);
  if (!workspace) return null;
  const next: WorkspaceRecord = {
    ...workspace,
    sandbox: { ...sandbox, updatedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  await redis.set(workspaceKey(workspaceId), next);
  return next;
}

export type AcceptInviteInput = {
  token: string;
  projectId: string;
  accountId: string;
  member: { displayName: string; wallet: string | null; gnsIdentity: string | null };
};

export type AcceptInviteResult =
  | { ok: true; workspace: WorkspaceRecord; role: WorkspaceMember["role"] }
  | {
      ok: false;
      reason:
        | "invalid"
        | "used"
        | "expired"
        | "workspace_missing"
        | "wrong_workspace"
        | "already_member";
    };

/**
 * Redeems a secure invite link and joins the caller to the bound workspace with
 * the invite's role. Single-use, expiry-aware, and workspace-scoped.
 */
export async function acceptWorkspaceInvite(
  redis: WorkspaceRedis,
  input: AcceptInviteInput,
): Promise<AcceptInviteResult> {
  if (!isValidInviteToken(input.token)) return { ok: false, reason: "invalid" };
  const invite = await peekWorkspaceInvite(redis, input.token);
  if (!invite) return { ok: false, reason: "invalid" };

  const workspace = await getWorkspaceById(redis, invite.workspaceId);
  if (!workspace) return { ok: false, reason: "workspace_missing" };
  if (workspace.projectId !== input.projectId) return { ok: false, reason: "wrong_workspace" };

  const existing = await getWorkspaceMember(redis, workspace.id, input.accountId);
  if (existing) return { ok: false, reason: "already_member" };

  if (invite.used) return { ok: false, reason: "used" };
  const now = Date.now();
  const expiry = Date.parse(invite.expiresAt);
  if (Number.isNaN(expiry) || expiry <= now) return { ok: false, reason: "expired" };

  const consumed = await consumeWorkspaceInvite(redis, input.token, input.accountId);
  if (!consumed.ok) {
    return { ok: false, reason: consumed.reason === "used" ? "used" : consumed.reason === "expired" ? "expired" : "invalid" };
  }

  const joinedAt = new Date().toISOString();
  const member: WorkspaceMember = {
    accountId: input.accountId,
    role: invite.role,
    displayName: input.member.displayName.slice(0, 120) || "Collaborator",
    wallet: input.member.wallet,
    gnsIdentity: input.member.gnsIdentity,
    invitedBy: invite.createdBy || null,
    joinedAt,
  };
  await upsertWorkspaceMember(redis, workspace.id, member, {
    projectId: workspace.projectId,
    ownerAccountId: workspace.ownerAccountId,
    title: workspace.title,
  });
  await recordWorkspaceActivity(redis, {
    workspaceId: workspace.id,
    type: "member_joined",
    actorId: input.accountId,
    actorName: member.displayName,
    summary: `${member.displayName} joined as ${member.role}`,
    now: joinedAt,
  });
  return { ok: true, workspace, role: invite.role };
}

export async function touchWorkspaceActivity(redis: WorkspaceRedis, workspaceId: string) {
  const workspace = await getWorkspaceById(redis, workspaceId);
  if (!workspace) return;
  const now = new Date().toISOString();
  await redis.set(workspaceKey(workspaceId), { ...workspace, lastActivityAt: now, updatedAt: now });
}
