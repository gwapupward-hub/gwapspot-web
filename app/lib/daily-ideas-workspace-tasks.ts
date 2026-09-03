import { randomBytes } from "node:crypto";
import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import {
  boundedText,
  buildSeedTasks,
  isWorkspaceTaskPriority,
  isWorkspaceTaskStatus,
  type WorkspaceTask,
  type WorkspaceTaskPriority,
  type WorkspaceTaskStatus,
} from "./daily-ideas-workspace-core.ts";

const MAX_TASKS = 400;

function tasksKey(workspaceId: string) {
  return workspaceStorageKey("di-workspace-tasks", workspaceId);
}

function makeTaskId() {
  return `task_${randomBytes(9).toString("base64url")}`;
}

function normalizeTasks(value: unknown): WorkspaceTask[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is WorkspaceTask =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as WorkspaceTask).id === "string" &&
      typeof (item as WorkspaceTask).title === "string" &&
      isWorkspaceTaskStatus((item as WorkspaceTask).status),
  );
}

export async function listWorkspaceTasks(redis: WorkspaceRedis, workspaceId: string) {
  return normalizeTasks(await redis.get<WorkspaceTask[]>(tasksKey(workspaceId)));
}

/** Seeds tasks from the project roadmap once; safe to retry (won't duplicate). */
export async function seedWorkspaceTasksIfEmpty(
  redis: WorkspaceRedis,
  input: {
    workspaceId: string;
    createdBy: string;
    buildRoadmap: string[];
    firstAction: string;
    now?: string;
  },
) {
  const existing = await listWorkspaceTasks(redis, input.workspaceId);
  if (existing.length > 0) return { created: false, tasks: existing };
  const now = input.now ?? new Date().toISOString();
  const seeded = buildSeedTasks({
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    buildRoadmap: input.buildRoadmap,
    firstAction: input.firstAction,
    now,
    makeId: () => makeTaskId(),
  });
  await redis.set(tasksKey(input.workspaceId), seeded);
  return { created: true, tasks: seeded };
}

export type CreateTaskInput = {
  title: unknown;
  description?: unknown;
  priority?: unknown;
  assigneeId?: unknown;
  status?: unknown;
};

export async function createWorkspaceTask(
  redis: WorkspaceRedis,
  workspaceId: string,
  createdBy: string,
  input: CreateTaskInput,
): Promise<{ ok: true; task: WorkspaceTask } | { ok: false; reason: "invalid" | "limit" }> {
  const title = boundedText(input.title, 200);
  if (!title) return { ok: false, reason: "invalid" };
  const tasks = await listWorkspaceTasks(redis, workspaceId);
  if (tasks.length >= MAX_TASKS) return { ok: false, reason: "limit" };

  const now = new Date().toISOString();
  const priority: WorkspaceTaskPriority = isWorkspaceTaskPriority(input.priority)
    ? input.priority
    : "medium";
  const status: WorkspaceTaskStatus = isWorkspaceTaskStatus(input.status) ? input.status : "todo";
  const description = input.description === undefined ? undefined : boundedText(input.description, 2_000) ?? undefined;
  const assigneeId =
    typeof input.assigneeId === "string" && input.assigneeId.trim()
      ? input.assigneeId.trim().slice(0, 120)
      : undefined;

  const task: WorkspaceTask = {
    id: makeTaskId(),
    workspaceId,
    title,
    ...(description ? { description } : {}),
    status,
    priority,
    ...(assigneeId ? { assigneeId } : {}),
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await redis.set(tasksKey(workspaceId), [task, ...tasks].slice(0, MAX_TASKS));
  return { ok: true, task };
}

export type UpdateTaskPatch = {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  status?: unknown;
  assigneeId?: unknown;
};

/** Returns whether the change is "material" enough to warrant an activity event. */
export function isMaterialTaskChange(before: WorkspaceTask, after: WorkspaceTask) {
  return (
    before.status !== after.status ||
    before.assigneeId !== after.assigneeId ||
    before.title !== after.title ||
    before.priority !== after.priority
  );
}

export async function updateWorkspaceTask(
  redis: WorkspaceRedis,
  workspaceId: string,
  taskId: string,
  patch: UpdateTaskPatch,
): Promise<{ ok: true; task: WorkspaceTask; previous: WorkspaceTask } | { ok: false; reason: "not_found" | "invalid" }> {
  const tasks = await listWorkspaceTasks(redis, workspaceId);
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return { ok: false, reason: "not_found" };
  const previous = tasks[index];
  const next: WorkspaceTask = { ...previous };

  if (patch.title !== undefined) {
    const title = boundedText(patch.title, 200);
    if (!title) return { ok: false, reason: "invalid" };
    next.title = title;
  }
  if (patch.description !== undefined) {
    const description = boundedText(patch.description, 2_000);
    if (description) next.description = description;
    else delete next.description;
  }
  if (patch.priority !== undefined) {
    if (!isWorkspaceTaskPriority(patch.priority)) return { ok: false, reason: "invalid" };
    next.priority = patch.priority;
  }
  if (patch.status !== undefined) {
    if (!isWorkspaceTaskStatus(patch.status)) return { ok: false, reason: "invalid" };
    next.status = patch.status;
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId === null || patch.assigneeId === "") {
      delete next.assigneeId;
    } else if (typeof patch.assigneeId === "string" && patch.assigneeId.trim()) {
      next.assigneeId = patch.assigneeId.trim().slice(0, 120);
    } else {
      return { ok: false, reason: "invalid" };
    }
  }

  next.updatedAt = new Date().toISOString();
  const updated = [...tasks];
  updated[index] = next;
  await redis.set(tasksKey(workspaceId), updated);
  return { ok: true, task: next, previous };
}

export async function deleteWorkspaceTask(
  redis: WorkspaceRedis,
  workspaceId: string,
  taskId: string,
): Promise<{ ok: true; task: WorkspaceTask } | { ok: false; reason: "not_found" }> {
  const tasks = await listWorkspaceTasks(redis, workspaceId);
  const target = tasks.find((task) => task.id === taskId);
  if (!target) return { ok: false, reason: "not_found" };
  await redis.set(
    tasksKey(workspaceId),
    tasks.filter((task) => task.id !== taskId),
  );
  return { ok: true, task: target };
}
