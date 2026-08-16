import "server-only";

import type { DailyIdeaMode, GeneratedDailyIdea } from "./daily-ideas-core";
import { getStoredDailyIdea } from "./daily-ideas-inventory";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

type DeliveryHistoryEntry = {
  ideaId: string;
  deliveredAt: string;
  mode: DailyIdeaMode;
};

export type DailyIdeaHistoryItem = DeliveryHistoryEntry & {
  idea: GeneratedDailyIdea | null;
};

function historyKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-delivery-history", subject);
}

export async function listDailyIdeaHistory(
  subject: string,
  input: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const limit = Math.min(10, Math.max(1, Math.floor(input.limit || 5)));
  const stored = await getWorkspaceRedis().get<DeliveryHistoryEntry[]>(historyKey(subject));
  const entries = Array.isArray(stored) ? stored : [];
  const page = entries.slice(offset, offset + limit);
  const items: DailyIdeaHistoryItem[] = await Promise.all(
    page.map(async (entry) => ({ ...entry, idea: await getStoredDailyIdea(entry.ideaId) })),
  );
  const nextOffset = offset + page.length < entries.length ? offset + page.length : null;
  return { items, total: entries.length, offset, limit, nextOffset };
}
