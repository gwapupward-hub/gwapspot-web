import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import { getStoredDailyIdea } from "./daily-ideas-inventory";
import type { GeneratedDailyIdea } from "./daily-ideas-core";

const MAX_SAVED_IDEAS = 200;

export type SavedDailyIdea = {
  idea: GeneratedDailyIdea;
  savedAt: string;
};

function savesKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-saves", subject);
}

function normalizeSaved(value: unknown): SavedDailyIdea[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SavedDailyIdea => Boolean(
    entry &&
      typeof entry === "object" &&
      "idea" in entry &&
      "savedAt" in entry &&
      (entry as SavedDailyIdea).idea?.id &&
      typeof (entry as SavedDailyIdea).savedAt === "string",
  ));
}

export async function saveDailyIdea(subject: string, ideaId: string) {
  const idea = await getStoredDailyIdea(ideaId);
  if (!idea) return { ok: false as const, reason: "not_found" as const };

  const redis = getWorkspaceRedis();
  const existing = normalizeSaved(await redis.get<SavedDailyIdea[]>(savesKey(subject)));
  const alreadySaved = existing.find((entry) => entry.idea.id === idea.id);
  if (alreadySaved) {
    return { ok: true as const, created: false, saved: alreadySaved };
  }

  const saved: SavedDailyIdea = {
    idea: { ...idea, status: "saved" },
    savedAt: new Date().toISOString(),
  };
  await redis.set(
    savesKey(subject),
    [saved, ...existing.filter((entry) => entry.idea.id !== idea.id)].slice(0, MAX_SAVED_IDEAS),
  );
  return { ok: true as const, created: true, saved };
}

export async function unsaveDailyIdea(subject: string, ideaId: string) {
  const redis = getWorkspaceRedis();
  const existing = normalizeSaved(await redis.get<SavedDailyIdea[]>(savesKey(subject)));
  const next = existing.filter((entry) => entry.idea.id !== ideaId);
  if (next.length === existing.length) return { removed: false };
  await redis.set(savesKey(subject), next);
  return { removed: true };
}

export async function listSavedDailyIdeas(
  subject: string,
  input: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const limit = Math.min(10, Math.max(1, Math.floor(input.limit || 5)));
  const redis = getWorkspaceRedis();
  const existing = normalizeSaved(await redis.get<SavedDailyIdea[]>(savesKey(subject)));
  const items = existing.slice(offset, offset + limit);
  const nextOffset = offset + items.length < existing.length ? offset + items.length : null;
  return { items, total: existing.length, offset, limit, nextOffset };
}
