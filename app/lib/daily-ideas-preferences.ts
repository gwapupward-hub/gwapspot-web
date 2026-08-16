import "server-only";

import { dailyIdeaCategories, type DailyIdeaCategory } from "./daily-ideas-core";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

export type DailyIdeasPreferences = {
  categories: DailyIdeaCategory[];
  difficulty: "any" | "Starter" | "Intermediate" | "Advanced";
  budget: "any" | "low" | "medium" | "high";
  updatedAt: string;
};

const DEFAULT_PREFERENCES: DailyIdeasPreferences = {
  categories: ["general"],
  difficulty: "any",
  budget: "any",
  updatedAt: "",
};

function preferencesKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-preferences", subject);
}

function parseCategories(value: unknown): DailyIdeaCategory[] | null {
  if (!Array.isArray(value)) return null;
  const categories: DailyIdeaCategory[] = [...new Set(
    value.filter((item): item is DailyIdeaCategory =>
      typeof item === "string" && dailyIdeaCategories.includes(item as DailyIdeaCategory),
    ),
  )].slice(0, 8);
  return categories.length ? categories : ["general"];
}

function parseDifficulty(value: unknown): DailyIdeasPreferences["difficulty"] | null {
  return value === "any" || value === "Starter" || value === "Intermediate" || value === "Advanced"
    ? value
    : null;
}

function parseBudget(value: unknown): DailyIdeasPreferences["budget"] | null {
  return value === "any" || value === "low" || value === "medium" || value === "high" ? value : null;
}

export async function getDailyIdeasPreferences(subject: string) {
  const stored = await getWorkspaceRedis().get<Partial<DailyIdeasPreferences>>(preferencesKey(subject));
  if (!stored) return { ...DEFAULT_PREFERENCES };
  return {
    categories: parseCategories(stored.categories) || DEFAULT_PREFERENCES.categories,
    difficulty: parseDifficulty(stored.difficulty) || DEFAULT_PREFERENCES.difficulty,
    budget: parseBudget(stored.budget) || DEFAULT_PREFERENCES.budget,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : "",
  } satisfies DailyIdeasPreferences;
}

export async function updateDailyIdeasPreferences(
  subject: string,
  input: { categories?: unknown; difficulty?: unknown; budget?: unknown },
) {
  const current = await getDailyIdeasPreferences(subject);
  const categories = input.categories === undefined ? current.categories : parseCategories(input.categories);
  const difficulty = input.difficulty === undefined ? current.difficulty : parseDifficulty(input.difficulty);
  const budget = input.budget === undefined ? current.budget : parseBudget(input.budget);
  if (!categories || !difficulty || !budget) return null;

  const next: DailyIdeasPreferences = {
    categories,
    difficulty,
    budget,
    updatedAt: new Date().toISOString(),
  };
  await getWorkspaceRedis().set(preferencesKey(subject), next);
  return next;
}
