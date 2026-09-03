import { randomBytes } from "node:crypto";
import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import type {
  WorkspaceActivityEvent,
  WorkspaceActivityType,
} from "./daily-ideas-workspace-core.ts";

const MAX_ACTIVITY_EVENTS = 500;

function activityKey(workspaceId: string) {
  return workspaceStorageKey("di-workspace-activity", workspaceId);
}

function normalizeActivity(value: unknown): WorkspaceActivityEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is WorkspaceActivityEvent =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as WorkspaceActivityEvent).id === "string" &&
      typeof (item as WorkspaceActivityEvent).type === "string",
  );
}

export type RecordActivityInput = {
  workspaceId: string;
  type: WorkspaceActivityType;
  actorId: string;
  actorName: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
  now?: string;
};

/**
 * Appends a truthful activity event. Only real, observed actions should be
 * recorded here — never fabricated git commits, deployments, or AI actions.
 */
export async function recordWorkspaceActivity(
  redis: WorkspaceRedis,
  input: RecordActivityInput,
): Promise<WorkspaceActivityEvent> {
  const now = input.now ?? new Date().toISOString();
  const event: WorkspaceActivityEvent = {
    id: `act_${randomBytes(9).toString("base64url")}`,
    workspaceId: input.workspaceId,
    type: input.type,
    actorId: input.actorId,
    actorName: input.actorName.slice(0, 120),
    summary: input.summary.slice(0, 280),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    createdAt: now,
  };
  const events = normalizeActivity(await redis.get<WorkspaceActivityEvent[]>(activityKey(input.workspaceId)));
  await redis.set(activityKey(input.workspaceId), [event, ...events].slice(0, MAX_ACTIVITY_EVENTS));
  return event;
}

export async function listWorkspaceActivity(
  redis: WorkspaceRedis,
  workspaceId: string,
  input: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)));
  const events = normalizeActivity(await redis.get<WorkspaceActivityEvent[]>(activityKey(workspaceId)));
  const items = events.slice(offset, offset + limit);
  const nextOffset = offset + items.length < events.length ? offset + items.length : null;
  return { items, total: events.length, offset, limit, nextOffset };
}
