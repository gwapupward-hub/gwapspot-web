import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import { nextDailyIdeasDeliveryAt, type DailyIdeasDeliveryFrequency } from "./daily-ideas-delivery";
import { parseDailyIdeaCategory, type DailyIdeaCategory } from "./daily-ideas-core";

export type DailyIdeasGroupVote = "yes" | "maybe" | "no";

export type DailyIdeasGroupRecord = {
  chatId: string;
  chatType: "group" | "supergroup";
  title: string;
  active: boolean;
  enabled: boolean;
  category: DailyIdeaCategory;
  timezone: string | null;
  localHour: number;
  frequency: DailyIdeasDeliveryFrequency;
  nextDeliveryAt: string | null;
  lastDeliveredAt: string | null;
  installedByTelegramUserId: string;
  installedAt: string;
  updatedAt: string;
  failures: number;
  schemaVersion: 1;
};

export type ClaimedDailyIdeasGroupDelivery = {
  deliveryId: string;
  chatId: string;
  scheduledAt: string;
  category: DailyIdeaCategory;
  timezone: string;
  localHour: number;
  frequency: DailyIdeasDeliveryFrequency;
};

type GroupDeliveryRecord = {
  deliveryId: string;
  chatId: string;
  scheduledAt: string;
  status: "claimed" | "delivered" | "failed";
  claimedAt: string;
  completedAt: string | null;
};

type GroupVoteRecord = {
  ideaId: string;
  votes: Record<string, DailyIdeasGroupVote>;
  updatedAt: string;
};

const MAX_GROUP_REGISTRY = 500;
const MAX_GROUP_DELIVERY_BATCH = 20;
const LOCK_TTL_SECONDS = 10;
const DELIVERY_TTL_SECONDS = 60 * 60 * 24 * 30;
const HOUR_MS = 60 * 60 * 1_000;

function groupKey(chatId: string) {
  return getPrivateStorageKey("daily-ideas-group", chatId);
}
function registryKey() {
  return getPrivateStorageKey("daily-ideas-group-registry", "telegram");
}
function registryLockKey() {
  return getPrivateStorageKey("daily-ideas-group-registry-lock", "telegram");
}
function voteKey(chatId: string, ideaId: string) {
  return getPrivateStorageKey("daily-ideas-group-votes", `${chatId}:${ideaId}`);
}
function deliveryKey(deliveryId: string) {
  return getPrivateStorageKey("daily-ideas-group-delivery", deliveryId);
}

export function isTelegramGroupChatId(value: unknown): value is string {
  return typeof value === "string" && /^-\d{5,20}$/.test(value);
}

function isTelegramUserId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}

function parseTimezone(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const timezone = value.trim().slice(0, 64);
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

function parseHour(value: unknown): number | null {
  const numeric = typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : value;
  return typeof numeric === "number" && Number.isInteger(numeric) && numeric >= 0 && numeric <= 23
    ? numeric
    : null;
}

function parseFrequency(value: unknown): DailyIdeasDeliveryFrequency | null {
  return value === "daily" || value === "weekdays" ? value : null;
}

function sanitizeTitle(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 128) : "Telegram group";
}

function sanitizeChatType(value: unknown): "group" | "supergroup" | null {
  return value === "group" || value === "supergroup" ? value : null;
}

export function dailyIdeasGroupSubject(chatId: string) {
  return `telegram-group:${chatId}`;
}

async function withRegistryLock<T>(run: () => Promise<T>) {
  const redis = getWorkspaceRedis();
  const token = randomUUID();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await redis.setIfAbsent(registryLockKey(), token, LOCK_TTL_SECONDS)) {
      try {
        return await run();
      } finally {
        await redis.deleteIfValue(registryLockKey(), token).catch(() => false);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 35 + attempt * 20));
  }
  throw new Error("Daily Ideas group registry is busy");
}

async function readRegistry() {
  const value = await getWorkspaceRedis().get<string[]>(registryKey());
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isTelegramGroupChatId))].slice(-MAX_GROUP_REGISTRY);
}

export async function getDailyIdeasGroup(chatId: string) {
  if (!isTelegramGroupChatId(chatId)) return null;
  const record = await getWorkspaceRedis().get<DailyIdeasGroupRecord>(groupKey(chatId));
  return record?.chatId === chatId && record.schemaVersion === 1 ? record : null;
}

export async function installDailyIdeasGroup(input: {
  chatId: string;
  chatType: unknown;
  title: unknown;
  installedByTelegramUserId: string;
}) {
  if (!isTelegramGroupChatId(input.chatId) || !isTelegramUserId(input.installedByTelegramUserId)) return null;
  const chatType = sanitizeChatType(input.chatType);
  if (!chatType) return null;
  const existing = await getDailyIdeasGroup(input.chatId);
  const now = new Date().toISOString();
  const record: DailyIdeasGroupRecord = {
    chatId: input.chatId,
    chatType,
    title: sanitizeTitle(input.title),
    active: true,
    enabled: existing?.enabled ?? false,
    category: existing?.category ?? "general",
    timezone: existing?.timezone ?? null,
    localHour: existing?.localHour ?? 9,
    frequency: existing?.frequency ?? "daily",
    nextDeliveryAt: existing?.nextDeliveryAt ?? null,
    lastDeliveredAt: existing?.lastDeliveredAt ?? null,
    installedByTelegramUserId: existing?.installedByTelegramUserId || input.installedByTelegramUserId,
    installedAt: existing?.installedAt || now,
    updatedAt: now,
    failures: 0,
    schemaVersion: 1,
  };
  await withRegistryLock(async () => {
    const redis = getWorkspaceRedis();
    const registry = await readRegistry();
    if (!registry.includes(record.chatId)) registry.push(record.chatId);
    await redis.set(registryKey(), registry.slice(-MAX_GROUP_REGISTRY));
    await redis.set(groupKey(record.chatId), record);
  });
  return record;
}

export async function updateDailyIdeasGroupSettings(
  chatId: string,
  input: { enabled?: unknown; category?: unknown; timezone?: unknown; localHour?: unknown; frequency?: unknown },
) {
  const current = await getDailyIdeasGroup(chatId);
  if (!current || !current.active) return null;
  const enabled = input.enabled === undefined ? current.enabled : input.enabled === true;
  const category = input.category === undefined ? current.category : parseDailyIdeaCategory(input.category);
  const timezone = input.timezone === undefined ? current.timezone : parseTimezone(input.timezone);
  const localHour = input.localHour === undefined ? current.localHour : parseHour(input.localHour);
  const frequency = input.frequency === undefined ? current.frequency : parseFrequency(input.frequency);
  if (localHour === null || frequency === null || (enabled && !timezone)) return null;
  const now = new Date();
  const next: DailyIdeasGroupRecord = {
    ...current,
    enabled,
    category,
    timezone,
    localHour,
    frequency,
    nextDeliveryAt: enabled && timezone
      ? nextDailyIdeasDeliveryAt(now, timezone, localHour, frequency)
      : null,
    updatedAt: now.toISOString(),
    failures: 0,
  };
  await getWorkspaceRedis().set(groupKey(chatId), next);
  return next;
}

export async function deactivateDailyIdeasGroup(chatId: string) {
  const current = await getDailyIdeasGroup(chatId);
  if (!current) return null;
  const next: DailyIdeasGroupRecord = {
    ...current,
    active: false,
    enabled: false,
    nextDeliveryAt: null,
    updatedAt: new Date().toISOString(),
  };
  await getWorkspaceRedis().set(groupKey(chatId), next);
  return next;
}

export async function recordDailyIdeasGroupVote(input: {
  chatId: string;
  ideaId: string;
  telegramUserId: string;
  vote: DailyIdeasGroupVote;
}) {
  if (
    !isTelegramGroupChatId(input.chatId) ||
    !isTelegramUserId(input.telegramUserId) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(input.ideaId) ||
    !["yes", "maybe", "no"].includes(input.vote)
  ) return null;
  const group = await getDailyIdeasGroup(input.chatId);
  if (!group?.active) return null;
  const redis = getWorkspaceRedis();
  const key = voteKey(input.chatId, input.ideaId);
  const stored = await redis.get<GroupVoteRecord>(key);
  const votes = stored?.ideaId === input.ideaId && stored.votes ? { ...stored.votes } : {};
  votes[input.telegramUserId] = input.vote;
  const record: GroupVoteRecord = { ideaId: input.ideaId, votes, updatedAt: new Date().toISOString() };
  await redis.set(key, record, { ex: 60 * 60 * 24 * 90 });
  const values = Object.values(votes);
  return {
    vote: input.vote,
    counts: {
      yes: values.filter((value) => value === "yes").length,
      maybe: values.filter((value) => value === "maybe").length,
      no: values.filter((value) => value === "no").length,
      total: values.length,
    },
  };
}

function groupDeliveryId(chatId: string, scheduledAt: string) {
  const digest = createHash("sha256").update(`${chatId}:${scheduledAt}`).digest("hex").slice(0, 24);
  return `group_delivery_${digest}`;
}

export async function claimDueDailyIdeasGroupDeliveries(now = new Date(), limit = 5) {
  const bounded = Math.max(1, Math.min(MAX_GROUP_DELIVERY_BATCH, Math.floor(limit)));
  return withRegistryLock(async () => {
    const redis = getWorkspaceRedis();
    const registry = await readRegistry();
    const groups = (await Promise.all(registry.map((chatId) => getDailyIdeasGroup(chatId))))
      .filter((group): group is DailyIdeasGroupRecord => Boolean(group?.active && group.enabled && group.timezone && group.nextDeliveryAt));
    const due = groups
      .filter((group) => Date.parse(group.nextDeliveryAt || "") <= now.getTime())
      .sort((a, b) => Date.parse(a.nextDeliveryAt || "") - Date.parse(b.nextDeliveryAt || ""))
      .slice(0, bounded);
    const claimed: ClaimedDailyIdeasGroupDelivery[] = [];
    for (const group of due) {
      if (!group.timezone || !group.nextDeliveryAt) continue;
      const scheduledAt = group.nextDeliveryAt;
      const deliveryId = groupDeliveryId(group.chatId, scheduledAt);
      const record: GroupDeliveryRecord = {
        deliveryId,
        chatId: group.chatId,
        scheduledAt,
        status: "claimed",
        claimedAt: now.toISOString(),
        completedAt: null,
      };
      const next = {
        ...group,
        nextDeliveryAt: nextDailyIdeasDeliveryAt(
          new Date(Date.parse(scheduledAt) + 60_000),
          group.timezone,
          group.localHour,
          group.frequency,
        ),
        updatedAt: now.toISOString(),
      };
      await redis.set(deliveryKey(deliveryId), record, { ex: DELIVERY_TTL_SECONDS });
      await redis.set(groupKey(group.chatId), next);
      claimed.push({
        deliveryId,
        chatId: group.chatId,
        scheduledAt,
        category: group.category,
        timezone: group.timezone,
        localHour: group.localHour,
        frequency: group.frequency,
      });
    }
    return claimed;
  });
}

export async function completeDailyIdeasGroupDelivery(input: {
  chatId: string;
  deliveryId: string;
  success: boolean;
}) {
  if (!isTelegramGroupChatId(input.chatId) || !/^group_delivery_[a-f0-9]{24}$/.test(input.deliveryId)) return null;
  const redis = getWorkspaceRedis();
  const record = await redis.get<GroupDeliveryRecord>(deliveryKey(input.deliveryId));
  if (!record || record.chatId !== input.chatId) return null;
  if (record.status === "delivered" && input.success) return record;
  const now = new Date();
  const completed: GroupDeliveryRecord = {
    ...record,
    status: input.success ? "delivered" : "failed",
    completedAt: now.toISOString(),
  };
  await redis.set(deliveryKey(input.deliveryId), completed, { ex: DELIVERY_TTL_SECONDS });
  const group = await getDailyIdeasGroup(input.chatId);
  if (group?.active) {
    const failures = input.success ? 0 : group.failures + 1;
    const next = {
      ...group,
      failures,
      lastDeliveredAt: input.success ? now.toISOString() : group.lastDeliveredAt,
      nextDeliveryAt: !input.success && group.timezone && failures < 3
        ? new Date(now.getTime() + HOUR_MS).toISOString()
        : group.nextDeliveryAt,
      updatedAt: now.toISOString(),
    };
    await redis.set(groupKey(group.chatId), next);
  }
  return completed;
}
