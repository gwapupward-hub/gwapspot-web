import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

export type DailyIdeasDeliveryFrequency = "daily" | "weekdays";

export type DailyIdeasDeliveryPreferences = {
  enabled: boolean;
  timezone: string | null;
  localHour: number;
  frequency: DailyIdeasDeliveryFrequency;
  nextDeliveryAt: string | null;
  lastDeliveredAt: string | null;
  updatedAt: string;
};

type DeliveryRegistryEntry = DailyIdeasDeliveryPreferences & {
  telegramUserId: string;
  failures: number;
};

type DeliveryRecord = {
  deliveryId: string;
  telegramUserId: string;
  scheduledAt: string;
  status: "claimed" | "delivered" | "failed";
  claimedAt: string;
  completedAt: string | null;
};

export type ClaimedDailyIdeasDelivery = {
  deliveryId: string;
  telegramUserId: string;
  scheduledAt: string;
  timezone: string;
  localHour: number;
  frequency: DailyIdeasDeliveryFrequency;
};

const DEFAULT_PREFERENCES: DailyIdeasDeliveryPreferences = {
  enabled: false,
  timezone: null,
  localHour: 9,
  frequency: "daily",
  nextDeliveryAt: null,
  lastDeliveredAt: null,
  updatedAt: "",
};

const HOUR_MS = 60 * 60 * 1_000;
const REGISTRY_LOCK_TTL_SECONDS = 10;
const DELIVERY_RECORD_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_DELIVERY_BATCH = 25;

function preferencesKey(telegramUserId: string) {
  return getPrivateStorageKey("daily-ideas-delivery-preferences", `telegram:${telegramUserId}`);
}

function registryKey() {
  return getPrivateStorageKey("daily-ideas-delivery-registry", "telegram");
}

function registryLockKey() {
  return getPrivateStorageKey("daily-ideas-delivery-registry-lock", "telegram");
}

function deliveryRecordKey(deliveryId: string) {
  return getPrivateStorageKey("daily-ideas-delivery-record", deliveryId);
}

function isTelegramUserId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}

function parseFrequency(value: unknown): DailyIdeasDeliveryFrequency | null {
  return value === "daily" || value === "weekdays" ? value : null;
}

function parseLocalHour(value: unknown): number | null {
  const numeric = typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : value;
  return typeof numeric === "number" && Number.isInteger(numeric) && numeric >= 0 && numeric <= 23
    ? numeric
    : null;
}

function parseTimeZone(value: unknown): string | null {
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

function isWeekday(weekday: string) {
  return weekday !== "Sat" && weekday !== "Sun";
}

function localClock(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: parts.weekday || "",
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function nextDailyIdeasDeliveryAt(
  after: Date,
  timezone: string,
  localHour: number,
  frequency: DailyIdeasDeliveryFrequency,
) {
  const firstHour = Math.ceil((after.getTime() + 1_000) / HOUR_MS) * HOUR_MS;
  for (let index = 0; index < 24 * 8; index += 1) {
    const candidate = new Date(firstHour + index * HOUR_MS);
    const clock = localClock(candidate, timezone);
    if (
      clock.hour === localHour &&
      clock.minute === 0 &&
      (frequency === "daily" || isWeekday(clock.weekday))
    ) {
      return candidate.toISOString();
    }
  }
  throw new Error("Unable to resolve next Daily Ideas delivery time");
}

function normalizeStoredPreferences(value: Partial<DailyIdeasDeliveryPreferences> | null) {
  const timezone = parseTimeZone(value?.timezone);
  const localHour = parseLocalHour(value?.localHour) ?? DEFAULT_PREFERENCES.localHour;
  const frequency = parseFrequency(value?.frequency) ?? DEFAULT_PREFERENCES.frequency;
  const enabled = value?.enabled === true && Boolean(timezone);
  return {
    enabled,
    timezone,
    localHour,
    frequency,
    nextDeliveryAt:
      enabled && typeof value?.nextDeliveryAt === "string" && !Number.isNaN(Date.parse(value.nextDeliveryAt))
        ? value.nextDeliveryAt
        : null,
    lastDeliveredAt:
      typeof value?.lastDeliveredAt === "string" && !Number.isNaN(Date.parse(value.lastDeliveredAt))
        ? value.lastDeliveredAt
        : null,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
  } satisfies DailyIdeasDeliveryPreferences;
}

async function readRegistry() {
  const stored = await getWorkspaceRedis().get<DeliveryRegistryEntry[]>(registryKey());
  if (!Array.isArray(stored)) return [];
  return stored.filter((entry) =>
    entry &&
    isTelegramUserId(entry.telegramUserId) &&
    entry.enabled === true &&
    typeof entry.timezone === "string" &&
    typeof entry.nextDeliveryAt === "string" &&
    !Number.isNaN(Date.parse(entry.nextDeliveryAt)),
  );
}

async function withRegistryLock<T>(run: () => Promise<T>) {
  const redis = getWorkspaceRedis();
  const token = randomUUID();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await redis.setIfAbsent(registryLockKey(), token, REGISTRY_LOCK_TTL_SECONDS)) {
      try {
        return await run();
      } finally {
        await redis.deleteIfValue(registryLockKey(), token).catch(() => false);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 35 + attempt * 20));
  }
  throw new Error("Daily Ideas delivery registry is busy");
}

export async function getDailyIdeasDeliveryPreferences(telegramUserId: string) {
  if (!isTelegramUserId(telegramUserId)) return null;
  const stored = await getWorkspaceRedis().get<Partial<DailyIdeasDeliveryPreferences>>(
    preferencesKey(telegramUserId),
  );
  return normalizeStoredPreferences(stored);
}

export async function updateDailyIdeasDeliveryPreferences(
  telegramUserId: string,
  input: {
    enabled?: unknown;
    timezone?: unknown;
    localHour?: unknown;
    frequency?: unknown;
  },
) {
  if (!isTelegramUserId(telegramUserId)) return null;
  const current = (await getDailyIdeasDeliveryPreferences(telegramUserId)) || { ...DEFAULT_PREFERENCES };

  const enabled = input.enabled === undefined ? current.enabled : input.enabled === true;
  const timezone = input.timezone === undefined ? current.timezone : parseTimeZone(input.timezone);
  const localHour = input.localHour === undefined ? current.localHour : parseLocalHour(input.localHour);
  const frequency = input.frequency === undefined ? current.frequency : parseFrequency(input.frequency);
  if (localHour === null || frequency === null || (enabled && !timezone)) return null;

  const now = new Date();
  const next: DailyIdeasDeliveryPreferences = {
    enabled,
    timezone,
    localHour,
    frequency,
    nextDeliveryAt: enabled && timezone
      ? nextDailyIdeasDeliveryAt(now, timezone, localHour, frequency)
      : null,
    lastDeliveredAt: current.lastDeliveredAt,
    updatedAt: now.toISOString(),
  };

  await withRegistryLock(async () => {
    const redis = getWorkspaceRedis();
    const registry = await readRegistry();
    const remaining = registry.filter((entry) => entry.telegramUserId !== telegramUserId);
    if (next.enabled && next.timezone && next.nextDeliveryAt) {
      remaining.push({ ...next, telegramUserId, failures: 0 });
    }
    await redis.set(registryKey(), remaining);
    await redis.set(preferencesKey(telegramUserId), next);
  });

  return next;
}

function deliveryIdFor(telegramUserId: string, scheduledAt: string) {
  const digest = createHash("sha256")
    .update(`${telegramUserId}:${scheduledAt}`)
    .digest("hex")
    .slice(0, 24);
  return `delivery_${digest}`;
}

export async function claimDueDailyIdeasDeliveries(now = new Date(), limit = 10) {
  const boundedLimit = Math.max(1, Math.min(MAX_DELIVERY_BATCH, Math.floor(limit)));
  return withRegistryLock(async () => {
    const redis = getWorkspaceRedis();
    const registry = await readRegistry();
    const due = registry
      .filter((entry) => Date.parse(entry.nextDeliveryAt || "") <= now.getTime())
      .sort((left, right) => Date.parse(left.nextDeliveryAt || "") - Date.parse(right.nextDeliveryAt || ""))
      .slice(0, boundedLimit);

    if (!due.length) return [] as ClaimedDailyIdeasDelivery[];

    const dueIds = new Set(due.map((entry) => entry.telegramUserId));
    const nextRegistry = registry.map((entry) => {
      if (!dueIds.has(entry.telegramUserId) || !entry.timezone || !entry.nextDeliveryAt) return entry;
      return {
        ...entry,
        nextDeliveryAt: nextDailyIdeasDeliveryAt(
          new Date(Date.parse(entry.nextDeliveryAt) + 60_000),
          entry.timezone,
          entry.localHour,
          entry.frequency,
        ),
        updatedAt: now.toISOString(),
      };
    });

    const claimed: ClaimedDailyIdeasDelivery[] = [];
    for (const entry of due) {
      if (!entry.timezone || !entry.nextDeliveryAt) continue;
      const deliveryId = deliveryIdFor(entry.telegramUserId, entry.nextDeliveryAt);
      const record: DeliveryRecord = {
        deliveryId,
        telegramUserId: entry.telegramUserId,
        scheduledAt: entry.nextDeliveryAt,
        status: "claimed",
        claimedAt: now.toISOString(),
        completedAt: null,
      };
      await redis.set(deliveryRecordKey(deliveryId), record, { ex: DELIVERY_RECORD_TTL_SECONDS });
      claimed.push({
        deliveryId,
        telegramUserId: entry.telegramUserId,
        scheduledAt: entry.nextDeliveryAt,
        timezone: entry.timezone,
        localHour: entry.localHour,
        frequency: entry.frequency,
      });
    }

    await redis.set(registryKey(), nextRegistry);
    for (const entry of nextRegistry) {
      if (!dueIds.has(entry.telegramUserId)) continue;
      await redis.set(preferencesKey(entry.telegramUserId), {
        enabled: entry.enabled,
        timezone: entry.timezone,
        localHour: entry.localHour,
        frequency: entry.frequency,
        nextDeliveryAt: entry.nextDeliveryAt,
        lastDeliveredAt: entry.lastDeliveredAt,
        updatedAt: entry.updatedAt,
      } satisfies DailyIdeasDeliveryPreferences);
    }

    return claimed;
  });
}

export async function completeDailyIdeasDelivery(input: {
  telegramUserId: string;
  deliveryId: string;
  success: boolean;
}) {
  if (!isTelegramUserId(input.telegramUserId) || !/^delivery_[a-f0-9]{24}$/.test(input.deliveryId)) {
    return null;
  }

  const redis = getWorkspaceRedis();
  const record = await redis.get<DeliveryRecord>(deliveryRecordKey(input.deliveryId));
  if (!record || record.telegramUserId !== input.telegramUserId) return null;
  if (record.status === "delivered" && input.success) return record;

  const now = new Date();
  const completed: DeliveryRecord = {
    ...record,
    status: input.success ? "delivered" : "failed",
    completedAt: now.toISOString(),
  };
  await redis.set(deliveryRecordKey(input.deliveryId), completed, { ex: DELIVERY_RECORD_TTL_SECONDS });

  await withRegistryLock(async () => {
    const registry = await readRegistry();
    const index = registry.findIndex((entry) => entry.telegramUserId === input.telegramUserId);
    if (index < 0) return;
    const current = registry[index];
    if (!current.timezone) return;

    if (input.success) {
      registry[index] = {
        ...current,
        failures: 0,
        lastDeliveredAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    } else {
      const failures = current.failures + 1;
      registry[index] = {
        ...current,
        failures,
        nextDeliveryAt: failures < 3
          ? new Date(now.getTime() + HOUR_MS).toISOString()
          : nextDailyIdeasDeliveryAt(now, current.timezone, current.localHour, current.frequency),
        updatedAt: now.toISOString(),
      };
    }

    const next = registry[index];
    await redis.set(registryKey(), registry);
    await redis.set(preferencesKey(input.telegramUserId), {
      enabled: next.enabled,
      timezone: next.timezone,
      localHour: next.localHour,
      frequency: next.frequency,
      nextDeliveryAt: next.nextDeliveryAt,
      lastDeliveredAt: next.lastDeliveredAt,
      updatedAt: next.updatedAt,
    } satisfies DailyIdeasDeliveryPreferences);
  });

  return completed;
}
