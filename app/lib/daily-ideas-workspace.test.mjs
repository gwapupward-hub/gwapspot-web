import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptWorkspaceInvite,
  createWorkspace,
  resolveWorkspaceForAccount,
} from "./daily-ideas-collab-workspace.ts";
import {
  changeWorkspaceMemberRole,
  listAccountWorkspaces,
  listWorkspaceMembers,
  removeWorkspaceMember,
} from "./daily-ideas-workspace-members.ts";
import {
  createWorkspaceInvite,
} from "./daily-ideas-workspace-invites.ts";
import {
  createWorkspaceTask,
  listWorkspaceTasks,
  updateWorkspaceTask,
} from "./daily-ideas-workspace-tasks.ts";
import { runWorkspaceCommand } from "./daily-ideas-workspace-terminal.ts";
import {
  readWorkspaceFile,
  writeWorkspaceFile,
} from "./daily-ideas-workspace-files.ts";
import { MemorySandboxProvider } from "./workspace-sandbox/memory.ts";

// --- In-memory WorkspaceRedis ---------------------------------------------

function createMemoryRedis() {
  const store = new Map();
  return {
    async get(key) {
      const raw = store.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    async set(key, value) {
      store.set(key, JSON.stringify(value));
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async incr(key) {
      const next = (Number(store.get(key)) || 0) + 1;
      store.set(key, String(next));
      return next;
    },
    async expire() {
      return 1;
    },
    async setIfAbsent(key, value) {
      if (store.has(key)) return false;
      store.set(key, JSON.stringify(value));
      return true;
    },
    async deleteIfValue(key, value) {
      if (store.get(key) === JSON.stringify(value)) {
        store.delete(key);
        return true;
      }
      return false;
    },
    async ping() {
      return true;
    },
  };
}

const OWNER = "gwap_ownerAAAAAAAAAAAAAAAAAA";
const DEV = "gwap_devBBBBBBBBBBBBBBBBBBBB";
const STRANGER = "gwap_strangerCCCCCCCCCCCCCC";
const PROJECT_ID = `project_${"a".repeat(20)}`;

function createInput(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    ideaId: "idea_demo",
    ownerAccountId: OWNER,
    title: "Local Farmers Marketplace",
    summary: "Connect local farms with nearby buyers.",
    category: "commerce",
    stage: "building",
    buildRoadmap: ["Build listings", "Add checkout", "Pilot with 3 farms"],
    firstAction: "Interview 3 local farms this week.",
    scaffoldProject: {
      title: "Local Farmers Marketplace",
      summary: "Connect local farms with nearby buyers.",
      category: "commerce",
      problemDefinition: "Small farms lack a channel.",
      targetCustomer: "Small farms",
      marketHypothesis: "Buyers pay a premium.",
      businessModel: "Transaction fee.",
      validationPlan: ["Interview 10 farms"],
      mvpFeatures: ["Listings"],
      technicalArchitecture: "Next.js + Postgres.",
      estimatedCost: "$2k",
      buildRoadmap: ["Build listings", "Add checkout", "Pilot with 3 farms"],
      goToMarket: "Farmers market.",
      risks: ["Chicken-and-egg"],
      firstAction: "Interview 3 local farms this week.",
    },
    owner: { displayName: "owner.gwap", wallet: null, gnsIdentity: "owner" },
    ...overrides,
  };
}

// --- Workspace create / idempotency / scaffold -----------------------------

test("createWorkspace provisions scaffold, seeds tasks, adds owner, and is idempotent", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();

  const first = await createWorkspace(redis, provider, createInput());
  assert.equal(first.created, true);
  assert.match(first.workspace.id, /^wsp_[a-f0-9]{24}$/);
  assert.equal(first.membership.role, "owner");

  // Scaffold files exist in the sandbox.
  const files = await provider.listFiles({ workspaceId: first.workspace.id, sandboxId: first.workspace.sandbox.sandboxId });
  const paths = files.map((file) => file.path);
  assert.ok(paths.includes("README.md"));
  assert.ok(paths.includes("PRODUCT_SPEC.md"));

  // Seed tasks derived from roadmap.
  const tasks = await listWorkspaceTasks(redis, first.workspace.id);
  assert.ok(tasks.length >= 3);
  assert.equal(tasks[0].title, "Interview 3 local farms this week.");

  // Idempotent: creating again returns the same workspace, no duplicate tasks.
  const second = await createWorkspace(redis, provider, createInput());
  assert.equal(second.created, false);
  assert.equal(second.workspace.id, first.workspace.id);
  const tasksAfter = await listWorkspaceTasks(redis, first.workspace.id);
  assert.equal(tasksAfter.length, tasks.length);
});

test("owner resolves their workspace; unrelated accounts are denied", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const { workspace } = await createWorkspace(redis, provider, createInput());

  const ownerAccess = await resolveWorkspaceForAccount(redis, PROJECT_ID, OWNER);
  assert.ok(ownerAccess);
  assert.equal(ownerAccess.membership.role, "owner");
  assert.equal(ownerAccess.workspace.id, workspace.id);

  const strangerAccess = await resolveWorkspaceForAccount(redis, PROJECT_ID, STRANGER);
  assert.equal(strangerAccess, null);
});

// --- Invitations -----------------------------------------------------------

test("invite link: valid join grants collaborator access", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const { workspace } = await createWorkspace(redis, provider, createInput());

  const invite = await createWorkspaceInvite(redis, {
    workspaceId: workspace.id,
    role: "developer",
    createdBy: OWNER,
  });
  assert.equal(invite.ok, true);

  const result = await acceptWorkspaceInvite(redis, {
    token: invite.token,
    projectId: PROJECT_ID,
    accountId: DEV,
    member: { displayName: "dev.gwap", wallet: null, gnsIdentity: "dev" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.role, "developer");

  const access = await resolveWorkspaceForAccount(redis, PROJECT_ID, DEV);
  assert.ok(access);
  assert.equal(access.membership.role, "developer");

  const refs = await listAccountWorkspaces(redis, DEV);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].projectId, PROJECT_ID);
});

test("invite link is single-use", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const { workspace } = await createWorkspace(redis, provider, createInput());
  const invite = await createWorkspaceInvite(redis, { workspaceId: workspace.id, role: "viewer", createdBy: OWNER });

  const first = await acceptWorkspaceInvite(redis, {
    token: invite.token,
    projectId: PROJECT_ID,
    accountId: DEV,
    member: { displayName: "dev", wallet: null, gnsIdentity: null },
  });
  assert.equal(first.ok, true);

  const second = await acceptWorkspaceInvite(redis, {
    token: invite.token,
    projectId: PROJECT_ID,
    accountId: STRANGER,
    member: { displayName: "stranger", wallet: null, gnsIdentity: null },
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "used");
});

test("invite rejects invalid token, wrong workspace, expiry, and self/duplicate", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const { workspace } = await createWorkspace(redis, provider, createInput());

  // Invalid token.
  const invalid = await acceptWorkspaceInvite(redis, {
    token: "not-a-real-token",
    projectId: PROJECT_ID,
    accountId: DEV,
    member: { displayName: "dev", wallet: null, gnsIdentity: null },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "invalid");

  // Wrong workspace: valid token but mismatched projectId.
  const invite = await createWorkspaceInvite(redis, { workspaceId: workspace.id, role: "developer", createdBy: OWNER });
  const wrong = await acceptWorkspaceInvite(redis, {
    token: invite.token,
    projectId: `project_${"b".repeat(20)}`,
    accountId: DEV,
    member: { displayName: "dev", wallet: null, gnsIdentity: null },
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "wrong_workspace");

  // Self invite: owner is already a member.
  const selfInvite = await createWorkspaceInvite(redis, { workspaceId: workspace.id, role: "developer", createdBy: OWNER });
  const self = await acceptWorkspaceInvite(redis, {
    token: selfInvite.token,
    projectId: PROJECT_ID,
    accountId: OWNER,
    member: { displayName: "owner", wallet: null, gnsIdentity: null },
  });
  assert.equal(self.ok, false);
  assert.equal(self.reason, "already_member");

  // Expired invite.
  const expired = await createWorkspaceInvite(redis, {
    workspaceId: workspace.id,
    role: "viewer",
    createdBy: OWNER,
    ttlSeconds: 60,
  });
  // Force expiry by rewriting the stored record in the past.
  const { hashInviteToken } = await import("./daily-ideas-workspace-core.ts");
  const { workspaceStorageKey } = await import("./daily-ideas-workspace-keys.ts");
  const key = workspaceStorageKey("di-workspace-invite", hashInviteToken(expired.token));
  const stored = await redis.get(key);
  stored.expiresAt = new Date(Date.now() - 1000).toISOString();
  await redis.set(key, stored);
  const expiredResult = await acceptWorkspaceInvite(redis, {
    token: expired.token,
    projectId: PROJECT_ID,
    accountId: STRANGER,
    member: { displayName: "stranger", wallet: null, gnsIdentity: null },
  });
  assert.equal(expiredResult.ok, false);
  assert.equal(expiredResult.reason, "expired");
});

// --- Member role management + owner protection -----------------------------

test("member roles change and the final owner cannot be removed or demoted", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const { workspace } = await createWorkspace(redis, provider, createInput());
  const index = { projectId: PROJECT_ID, ownerAccountId: OWNER, title: workspace.title };

  const invite = await createWorkspaceInvite(redis, { workspaceId: workspace.id, role: "viewer", createdBy: OWNER });
  await acceptWorkspaceInvite(redis, {
    token: invite.token,
    projectId: PROJECT_ID,
    accountId: DEV,
    member: { displayName: "dev", wallet: null, gnsIdentity: null },
  });

  // Promote viewer → developer.
  const promoted = await changeWorkspaceMemberRole(redis, workspace.id, DEV, "developer", index);
  assert.equal(promoted.ok, true);
  assert.equal(promoted.member.role, "developer");

  // Last owner protection.
  const demote = await changeWorkspaceMemberRole(redis, workspace.id, OWNER, "developer", index);
  assert.equal(demote.ok, false);
  assert.equal(demote.reason, "last_owner");

  const removeOwner = await removeWorkspaceMember(redis, workspace.id, OWNER);
  assert.equal(removeOwner.ok, false);
  assert.equal(removeOwner.reason, "last_owner");

  // Removing a collaborator works and clears their index.
  const removeDev = await removeWorkspaceMember(redis, workspace.id, DEV);
  assert.equal(removeDev.ok, true);
  assert.equal((await listWorkspaceMembers(redis, workspace.id)).length, 1);
  assert.equal((await listAccountWorkspaces(redis, DEV)).length, 0);
});

// --- Tasks -----------------------------------------------------------------

test("tasks can be created and updated", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const { workspace } = await createWorkspace(redis, provider, createInput());

  const created = await createWorkspaceTask(redis, workspace.id, OWNER, {
    title: "Wire up checkout",
    priority: "high",
  });
  assert.equal(created.ok, true);
  assert.equal(created.task.status, "todo");

  const updated = await updateWorkspaceTask(redis, workspace.id, created.task.id, {
    status: "in_progress",
    assigneeId: DEV,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.task.status, "in_progress");
  assert.equal(updated.task.assigneeId, DEV);

  const invalid = await createWorkspaceTask(redis, workspace.id, OWNER, { title: "   " });
  assert.equal(invalid.ok, false);
});

// --- Terminal (mocked provider) --------------------------------------------

test("terminal executes, preserves exit codes, and truncates output", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider({
    run: async (input) => {
      if (input.command === "exit 3") {
        return { stdout: "", stderr: "boom", exitCode: 3, status: "failed", durationMs: 2 };
      }
      if (input.command === "flood") {
        return { stdout: "x".repeat(300_000), stderr: "", exitCode: 0, status: "completed", durationMs: 2 };
      }
      return { stdout: `ran: ${input.command}`, stderr: "", exitCode: 0, status: "completed", durationMs: 1 };
    },
  });
  const { workspace } = await createWorkspace(redis, provider, createInput());
  const base = {
    workspaceId: workspace.id,
    sandboxId: workspace.sandbox.sandboxId,
    actorId: OWNER,
    actorName: "owner",
  };

  const ok = await runWorkspaceCommand(redis, provider, { ...base, command: "ls" });
  assert.equal(ok.ok, true);
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.status, "completed");
  assert.match(ok.stdout, /ran: ls/);

  const failed = await runWorkspaceCommand(redis, provider, { ...base, command: "exit 3" });
  assert.equal(failed.ok, true);
  assert.equal(failed.exitCode, 3);
  assert.equal(failed.status, "failed");

  const flood = await runWorkspaceCommand(redis, provider, { ...base, command: "flood" });
  assert.equal(flood.ok, true);
  assert.equal(flood.truncated, true);
  assert.ok(Buffer.byteLength(flood.stdout, "utf8") <= 100_000);
});

test("terminal rejects oversized commands and unavailable providers", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const degraded = new MemorySandboxProvider({ executionAvailable: false });
  const { workspace } = await createWorkspace(redis, provider, createInput());
  const base = {
    workspaceId: workspace.id,
    sandboxId: workspace.sandbox.sandboxId,
    actorId: OWNER,
    actorName: "owner",
  };

  const tooLong = await runWorkspaceCommand(redis, provider, { ...base, command: "x".repeat(5000) });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.reason, "too_long");

  const badCwd = await runWorkspaceCommand(redis, provider, { ...base, command: "ls", cwd: "../../etc" });
  assert.equal(badCwd.ok, false);
  assert.equal(badCwd.reason, "invalid_cwd");

  const unavailable = await runWorkspaceCommand(redis, degraded, { ...base, command: "ls" });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, "unavailable");
});

test("terminal times out a hung command without blocking", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider({
    run: (input) =>
      new Promise((resolve) => {
        const timer = setTimeout(
          () => resolve({ stdout: "late", stderr: "", exitCode: 0, status: "completed", durationMs: 9_999 }),
          5_000,
        );
        input.signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
      }),
  });
  const { workspace } = await createWorkspace(redis, provider, createInput());
  const result = await runWorkspaceCommand(redis, provider, {
    workspaceId: workspace.id,
    sandboxId: workspace.sandbox.sandboxId,
    actorId: OWNER,
    actorName: "owner",
    command: "sleep 100",
    timeoutMs: 1_000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "timeout");
});

test("terminal enforces per-workspace concurrency", async () => {
  const redis = createMemoryRedis();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const provider = new MemorySandboxProvider({
    run: async () => {
      await gate;
      return { stdout: "done", stderr: "", exitCode: 0, status: "completed", durationMs: 1 };
    },
  });
  const { workspace } = await createWorkspace(redis, provider, createInput());
  const base = {
    workspaceId: workspace.id,
    sandboxId: workspace.sandbox.sandboxId,
    actorId: OWNER,
    actorName: "owner",
    command: "long",
    timeoutMs: 5_000,
  };

  const a = runWorkspaceCommand(redis, provider, base);
  const b = runWorkspaceCommand(redis, provider, base);
  const c = runWorkspaceCommand(redis, provider, base);
  // Give the first two a tick to grab both concurrency slots.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const third = await c;
  assert.equal(third.ok, false);
  assert.equal(third.reason, "busy");
  release();
  await Promise.all([a, b]);
});

// --- Files (path security via provider) ------------------------------------

test("file writes normalize safe paths and reject traversal", async () => {
  const redis = createMemoryRedis();
  const provider = new MemorySandboxProvider();
  const { workspace } = await createWorkspace(redis, provider, createInput());
  const target = { workspaceId: workspace.id, sandboxId: workspace.sandbox.sandboxId };

  const write = await writeWorkspaceFile(provider, target, "src/app.ts", "export const x = 1;\n");
  assert.equal(write.ok, true);
  assert.equal(write.path, "src/app.ts");

  const read = await readWorkspaceFile(provider, target, "/workspace/src/app.ts");
  assert.equal(read.ok, true);
  assert.equal(read.file.content, "export const x = 1;\n");
  assert.equal(read.editable, true);

  const traversal = await writeWorkspaceFile(provider, target, "../../../etc/passwd", "hacked");
  assert.equal(traversal.ok, false);
  assert.equal(traversal.reason, "invalid_path");

  const binary = await writeWorkspaceFile(provider, target, "src/data.bin", "a\0b");
  assert.equal(binary.ok, false);
  assert.equal(binary.reason, "binary");
});
