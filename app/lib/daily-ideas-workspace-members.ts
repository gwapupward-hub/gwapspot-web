import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import {
  isWorkspaceRole,
  type AccountWorkspaceRef,
  type WorkspaceMember,
  type WorkspaceRole,
} from "./daily-ideas-workspace-core.ts";

function membersKey(workspaceId: string) {
  return workspaceStorageKey("di-workspace-members", workspaceId);
}
function accountIndexKey(accountId: string) {
  return workspaceStorageKey("di-workspace-index", accountId);
}

function normalizeMembers(value: unknown): WorkspaceMember[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is WorkspaceMember =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as WorkspaceMember).accountId === "string" &&
      isWorkspaceRole((item as WorkspaceMember).role),
  );
}

function normalizeRefs(value: unknown): AccountWorkspaceRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is AccountWorkspaceRef =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as AccountWorkspaceRef).workspaceId === "string" &&
      typeof (item as AccountWorkspaceRef).projectId === "string",
  );
}

export async function listWorkspaceMembers(redis: WorkspaceRedis, workspaceId: string) {
  return normalizeMembers(await redis.get<WorkspaceMember[]>(membersKey(workspaceId)));
}

export async function getWorkspaceMember(
  redis: WorkspaceRedis,
  workspaceId: string,
  accountId: string,
) {
  const members = await listWorkspaceMembers(redis, workspaceId);
  return members.find((member) => member.accountId === accountId) ?? null;
}

export async function listAccountWorkspaces(redis: WorkspaceRedis, accountId: string) {
  return normalizeRefs(await redis.get<AccountWorkspaceRef[]>(accountIndexKey(accountId)));
}

async function upsertAccountRef(redis: WorkspaceRedis, accountId: string, ref: AccountWorkspaceRef) {
  const refs = await listAccountWorkspaces(redis, accountId);
  const next = [ref, ...refs.filter((entry) => entry.workspaceId !== ref.workspaceId)].slice(0, 100);
  await redis.set(accountIndexKey(accountId), next);
}

async function removeAccountRef(redis: WorkspaceRedis, accountId: string, workspaceId: string) {
  const refs = await listAccountWorkspaces(redis, accountId);
  const next = refs.filter((entry) => entry.workspaceId !== workspaceId);
  await redis.set(accountIndexKey(accountId), next);
}

export type MemberIndexInfo = {
  projectId: string;
  ownerAccountId: string;
  title: string;
};

/** Adds or updates a member and keeps their per-account workspace index in sync. */
export async function upsertWorkspaceMember(
  redis: WorkspaceRedis,
  workspaceId: string,
  member: WorkspaceMember,
  index: MemberIndexInfo,
) {
  const members = await listWorkspaceMembers(redis, workspaceId);
  const existing = members.find((entry) => entry.accountId === member.accountId);
  const next = existing
    ? members.map((entry) => (entry.accountId === member.accountId ? { ...entry, ...member } : entry))
    : [...members, member];
  await redis.set(membersKey(workspaceId), next);
  await upsertAccountRef(redis, member.accountId, {
    workspaceId,
    projectId: index.projectId,
    ownerAccountId: index.ownerAccountId,
    role: member.role,
    title: index.title,
    joinedAt: member.joinedAt,
  });
  return { created: !existing, member };
}

export async function countWorkspaceOwners(redis: WorkspaceRedis, workspaceId: string) {
  const members = await listWorkspaceMembers(redis, workspaceId);
  return members.filter((member) => member.role === "owner").length;
}

export type MemberMutationResult =
  | { ok: true; member: WorkspaceMember }
  | { ok: false; reason: "not_found" | "last_owner" | "invalid_role" };

export async function changeWorkspaceMemberRole(
  redis: WorkspaceRedis,
  workspaceId: string,
  accountId: string,
  role: WorkspaceRole,
  index: MemberIndexInfo,
): Promise<MemberMutationResult> {
  if (!isWorkspaceRole(role)) return { ok: false, reason: "invalid_role" };
  const members = await listWorkspaceMembers(redis, workspaceId);
  const target = members.find((member) => member.accountId === accountId);
  if (!target) return { ok: false, reason: "not_found" };
  if (target.role === "owner" && role !== "owner") {
    const owners = members.filter((member) => member.role === "owner").length;
    if (owners <= 1) return { ok: false, reason: "last_owner" };
  }
  const updated: WorkspaceMember = { ...target, role };
  await redis.set(
    membersKey(workspaceId),
    members.map((member) => (member.accountId === accountId ? updated : member)),
  );
  await upsertAccountRef(redis, accountId, {
    workspaceId,
    projectId: index.projectId,
    ownerAccountId: index.ownerAccountId,
    role,
    title: index.title,
    joinedAt: target.joinedAt,
  });
  return { ok: true, member: updated };
}

export async function removeWorkspaceMember(
  redis: WorkspaceRedis,
  workspaceId: string,
  accountId: string,
): Promise<MemberMutationResult> {
  const members = await listWorkspaceMembers(redis, workspaceId);
  const target = members.find((member) => member.accountId === accountId);
  if (!target) return { ok: false, reason: "not_found" };
  if (target.role === "owner") {
    const owners = members.filter((member) => member.role === "owner").length;
    if (owners <= 1) return { ok: false, reason: "last_owner" };
  }
  await redis.set(
    membersKey(workspaceId),
    members.filter((member) => member.accountId !== accountId),
  );
  await removeAccountRef(redis, accountId, workspaceId);
  return { ok: true, member: target };
}
