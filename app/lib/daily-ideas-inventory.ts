import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import {
  parseDailyIdeaCategory,
  parseDailyIdeaFocus,
  parseDailyIdeaMode,
  selectReusableDailyIdea,
  type DailyIdeaMode,
  type GeneratedDailyIdea,
  type DailyIdeasProvider,
} from "./daily-ideas-core";
import { generateDailyIdeaWithMetadata, getDailyIdeasConfiguration } from "./daily-ideas-generator";

const MAX_CATEGORY_INVENTORY = 80;
const MAX_DELIVERY_HISTORY = 120;
const DAILY_CACHE_SECONDS = 2 * 24 * 60 * 60;

type InventoryEntry = {
  idea: GeneratedDailyIdea;
  provider: DailyIdeasProvider;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  attempts: number;
  storedAt: string;
};

type DeliveryHistoryEntry = {
  ideaId: string;
  deliveredAt: string;
  mode: DailyIdeaMode;
};

type GenerationRecord = {
  id: string;
  category: string;
  model: string;
  provider: DailyIdeasProvider | null;
  status: "pending" | "complete" | "error";
  createdAt: string;
  completedAt?: string;
  idea?: GeneratedDailyIdea;
  usage?: { inputTokens: number; outputTokens: number };
  attempts?: number;
  errorCode?: string;
};

export type DailyIdeaDelivery = {
  idea: GeneratedDailyIdea;
  delivery: {
    source: "inventory" | "generated" | "daily-cache";
    deliveredAt: string;
    mode: DailyIdeaMode;
  };
};

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function inventoryKey(category: string) {
  return getPrivateStorageKey("daily-ideas-inventory", category);
}

function historyKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-delivery-history", subject);
}

function generationKey(id: string) {
  return getPrivateStorageKey("daily-ideas-generation", id);
}

function dailyKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-daily", `${subject}:${utcDay()}`);
}

export async function getNextDailyIdea(input: {
  subject: string;
  category?: unknown;
  focus?: unknown;
  mode?: unknown;
}): Promise<DailyIdeaDelivery> {
  const redis = getWorkspaceRedis();
  const category = parseDailyIdeaCategory(input.category);
  const focus = parseDailyIdeaFocus(input.focus);
  const mode = parseDailyIdeaMode(input.mode);

  if (mode === "daily") {
    const cached = await redis.get<DailyIdeaDelivery>(dailyKey(input.subject));
    if (cached?.idea?.id) {
      return { ...cached, delivery: { ...cached.delivery, source: "daily-cache" } };
    }
  }

  const [inventory, history] = await Promise.all([
    redis.get<InventoryEntry[]>(inventoryKey(`${category}:${focus || "default"}`)),
    redis.get<DeliveryHistoryEntry[]>(historyKey(input.subject)),
  ]);
  const entries = Array.isArray(inventory) ? inventory : [];
  const delivered = new Set((Array.isArray(history) ? history : []).map((entry) => entry.ideaId));
  let idea = selectReusableDailyIdea(
    entries.map((entry) => entry.idea).filter(Boolean),
    delivered,
  );
  let source: DailyIdeaDelivery["delivery"]["source"] = "inventory";

  if (!idea) {
    const generationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const configuration = getDailyIdeasConfiguration();
    const pending: GenerationRecord = {
      id: generationId,
      category,
      model: configuration.model,
      provider: configuration.provider,
      status: "pending",
      createdAt: now,
    };
    await redis.set(generationKey(generationId), pending);

    try {
      const generated = await generateDailyIdeaWithMetadata(
        category,
        entries.map((entry) => entry.idea).filter(Boolean),
        generationId,
        focus,
      );
      idea = generated.idea;
      const storedAt = new Date().toISOString();
      const entry: InventoryEntry = { ...generated, storedAt };
      await Promise.all([
        redis.set(generationKey(generationId), {
          ...pending,
          status: "complete",
          completedAt: storedAt,
          idea,
          usage: generated.usage,
          attempts: generated.attempts,
          provider: generated.provider,
        } satisfies GenerationRecord),
        redis.set(
          inventoryKey(`${category}:${focus || "default"}`),
          [entry, ...entries].slice(0, MAX_CATEGORY_INVENTORY),
        ),
      ]);
      source = "generated";
    } catch (error) {
      await redis.set(generationKey(generationId), {
        ...pending,
        status: "error",
        completedAt: new Date().toISOString(),
        errorCode: error instanceof Error ? error.name.slice(0, 80) : "Error",
      } satisfies GenerationRecord);
      throw error;
    }
  }

  const deliveredAt = new Date().toISOString();
  const priorHistory = Array.isArray(history) ? history : [];
  const nextHistory: DeliveryHistoryEntry[] = [
    { ideaId: idea.id, deliveredAt, mode },
    ...priorHistory.filter((entry) => entry.ideaId !== idea?.id),
  ].slice(0, MAX_DELIVERY_HISTORY);
  const result: DailyIdeaDelivery = { idea, delivery: { source, deliveredAt, mode } };

  await Promise.all([
    redis.set(historyKey(input.subject), nextHistory),
    ...(mode === "daily" ? [redis.set(dailyKey(input.subject), result, { ex: DAILY_CACHE_SECONDS })] : []),
  ]);

  return result;
}
