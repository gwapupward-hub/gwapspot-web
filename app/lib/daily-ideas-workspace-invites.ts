import { randomBytes } from "node:crypto";
import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import {
  DEFAULT_INVITE_TTL_SECONDS,
  hashInviteToken,
  isAssignableInviteRole,
  isInviteRedeemable,
  isValidInviteToken,
  type WorkspaceInviteRecord,
  type WorkspaceRole,
} from "./daily-ideas-workspace-core.ts";

const MAX_INVITE_TTL_SECONDS = 30 * 24 * 60 * 60;

function inviteKey(tokenHash: string) {
  return workspaceStorageKey("di-workspace-invite", tokenHash);
}

function normalizeInvite(value: unknown): WorkspaceInviteRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WorkspaceInviteRecord>;
  if (
    typeof candidate.tokenHash !== "string" ||
    typeof candidate.workspaceId !== "string" ||
    !isAssignableInviteRole(candidate.role) ||
    typeof candidate.expiresAt !== "string"
  ) {
    return null;
  }
  return {
    tokenHash: candidate.tokenHash,
    workspaceId: candidate.workspaceId,
    role: candidate.role,
    createdBy: typeof candidate.createdBy === "string" ? candidate.createdBy : "",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date(0).toISOString(),
    expiresAt: candidate.expiresAt,
    used: candidate.used === true,
    usedBy: typeof candidate.usedBy === "string" ? candidate.usedBy : null,
    usedAt: typeof candidate.usedAt === "string" ? candidate.usedAt : null,
  };
}

export type CreateInviteInput = {
  workspaceId: string;
  role: WorkspaceRole;
  createdBy: string;
  ttlSeconds?: number;
};

export async function createWorkspaceInvite(
  redis: WorkspaceRedis,
  input: CreateInviteInput,
): Promise<{ ok: true; token: string; invite: WorkspaceInviteRecord } | { ok: false; reason: "invalid_role" }> {
  if (!isAssignableInviteRole(input.role)) return { ok: false, reason: "invalid_role" };
  const ttlSeconds = Math.min(
    MAX_INVITE_TTL_SECONDS,
    Math.max(60, Math.floor(input.ttlSeconds ?? DEFAULT_INVITE_TTL_SECONDS)),
  );
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const invite: WorkspaceInviteRecord = {
    tokenHash,
    workspaceId: input.workspaceId,
    role: input.role,
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    used: false,
    usedBy: null,
    usedAt: null,
  };
  await redis.set(inviteKey(tokenHash), invite, { ex: ttlSeconds });
  return { ok: true, token, invite };
}

export async function inspectWorkspaceInvite(redis: WorkspaceRedis, token: unknown) {
  if (!isValidInviteToken(token)) return null;
  const invite = normalizeInvite(await redis.get<WorkspaceInviteRecord>(inviteKey(hashInviteToken(token))));
  if (!invite || !isInviteRedeemable(invite)) return null;
  return invite;
}

/** Returns the stored invite regardless of used/expired state (for diagnostics). */
export async function peekWorkspaceInvite(redis: WorkspaceRedis, token: unknown) {
  if (!isValidInviteToken(token)) return null;
  return normalizeInvite(await redis.get<WorkspaceInviteRecord>(inviteKey(hashInviteToken(token))));
}

export type ConsumeInviteResult =
  | { ok: true; invite: WorkspaceInviteRecord }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/** Redeems an invite link once. Single-use: a redeemed token cannot be reused. */
export async function consumeWorkspaceInvite(
  redis: WorkspaceRedis,
  token: unknown,
  accountId: string,
): Promise<ConsumeInviteResult> {
  if (!isValidInviteToken(token)) return { ok: false, reason: "invalid" };
  const tokenHash = hashInviteToken(token);
  const invite = normalizeInvite(await redis.get<WorkspaceInviteRecord>(inviteKey(tokenHash)));
  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.used) return { ok: false, reason: "used" };
  if (!isInviteRedeemable(invite)) return { ok: false, reason: "expired" };

  const redeemed: WorkspaceInviteRecord = {
    ...invite,
    used: true,
    usedBy: accountId,
    usedAt: new Date().toISOString(),
  };
  // Keep the redeemed record briefly so a replay resolves as "used" rather than
  // "invalid", then it expires naturally.
  await redis.set(inviteKey(tokenHash), redeemed, { ex: 24 * 60 * 60 });
  return { ok: true, invite: redeemed };
}
