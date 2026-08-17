import "server-only";

import { randomUUID } from "node:crypto";
import { getStoredDailyIdea } from "./daily-ideas-inventory";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

export type DailyIdeasFeedbackRating = "great" | "useful" | "not-for-me" | "bad";
export type DailyIdeasEngagementKind =
  | "delivery"
  | "open"
  | "save"
  | "develop"
  | "share"
  | "feedback"
  | "product-feedback";

export type DailyIdeasStreak = {
  current: number;
  longest: number;
  totalDays: number;
  lastActiveDate: string | null;
  timezone: string;
};

export type DailyIdeasEngagementSummary = {
  streak: DailyIdeasStreak;
  totals: {
    deliveries: number;
    opens: number;
    saves: number;
    develops: number;
    shares: number;
    feedback: number;
  };
  updatedAt: string;
};

type EngagementEvent = {
  eventId: string;
  kind: DailyIdeasEngagementKind;
  ideaId: string | null;
  rating: DailyIdeasFeedbackRating | null;
  createdAt: string;
};

type ProductFeedbackEntry = {
  eventId: string;
  message: string;
  createdAt: string;
};

type EngagementState = {
  activeDays: string[];
  events: EngagementEvent[];
  firstOpenedAt: Record<string, string>;
  feedbackByIdea: Record<string, { rating: DailyIdeasFeedbackRating; updatedAt: string }>;
  productFeedback: ProductFeedbackEntry[];
  updatedAt: string;
};

const MAX_EVENTS = 600;
const MAX_ACTIVE_DAYS = 400;
const MAX_PRODUCT_FEEDBACK = 100;
const LOCK_TTL_SECONDS = 10;
const MEANINGFUL_KINDS = new Set<DailyIdeasEngagementKind>([
  "open",
  "save",
  "develop",
  "share",
  "feedback",
]);

function stateKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-engagement", subject);
}

function lockKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-engagement-lock", subject);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIdeaId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function isRating(value: unknown): value is DailyIdeasFeedbackRating {
  return value === "great" || value === "useful" || value === "not-for-me" || value === "bad";
}

function isKind(value: unknown): value is DailyIdeasEngagementKind {
  return value === "delivery" ||
    value === "open" ||
    value === "save" ||
    value === "develop" ||
    value === "share" ||
    value === "feedback" ||
    value === "product-feedback";
}

function normalizeTimezone(value: string | null | undefined) {
  const timezone = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

function localDateString(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDateString(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0));
  return previous.toISOString().slice(0, 10);
}

function normalizeEvent(value: unknown): EngagementEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Partial<EngagementEvent>;
  if (
    typeof event.eventId !== "string" ||
    !/^[A-Za-z0-9:_-]{1,100}$/.test(event.eventId) ||
    !isKind(event.kind) ||
    (event.ideaId !== null && event.ideaId !== undefined && !isIdeaId(event.ideaId)) ||
    (event.rating !== null && event.rating !== undefined && !isRating(event.rating)) ||
    typeof event.createdAt !== "string" ||
    Number.isNaN(Date.parse(event.createdAt))
  ) {
    return null;
  }
  return {
    eventId: event.eventId,
    kind: event.kind,
    ideaId: event.ideaId || null,
    rating: event.rating || null,
    createdAt: event.createdAt,
  };
}

function normalizeState(value: unknown): EngagementState {
  const state = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<EngagementState>
    : {};
  const activeDays = Array.isArray(state.activeDays)
    ? [...new Set(state.activeDays.filter(isDateString))].sort().slice(-MAX_ACTIVE_DAYS)
    : [];
  const events = Array.isArray(state.events)
    ? state.events.map(normalizeEvent).filter((event): event is EngagementEvent => Boolean(event)).slice(-MAX_EVENTS)
    : [];
  const firstOpenedAt = state.firstOpenedAt && typeof state.firstOpenedAt === "object" && !Array.isArray(state.firstOpenedAt)
    ? Object.fromEntries(Object.entries(state.firstOpenedAt).filter(([ideaId, createdAt]) =>
      isIdeaId(ideaId) && typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt))))
    : {};
  const feedbackByIdea = state.feedbackByIdea && typeof state.feedbackByIdea === "object" && !Array.isArray(state.feedbackByIdea)
    ? Object.fromEntries(Object.entries(state.feedbackByIdea).filter(([ideaId, entry]) =>
      isIdeaId(ideaId) &&
      entry &&
      typeof entry === "object" &&
      isRating((entry as { rating?: unknown }).rating) &&
      typeof (entry as { updatedAt?: unknown }).updatedAt === "string")) as EngagementState["feedbackByIdea"]
    : {};
  const productFeedback = Array.isArray(state.productFeedback)
    ? state.productFeedback.filter((entry): entry is ProductFeedbackEntry => Boolean(
      entry &&
      typeof entry === "object" &&
      typeof (entry as ProductFeedbackEntry).eventId === "string" &&
      typeof (entry as ProductFeedbackEntry).message === "string" &&
      typeof (entry as ProductFeedbackEntry).createdAt === "string",
    )).slice(-MAX_PRODUCT_FEEDBACK)
    : [];
  return {
    activeDays,
    events,
    firstOpenedAt,
    feedbackByIdea,
    productFeedback,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : "",
  };
}

function calculateStreak(activeDays: string[], timezone: string, now = new Date()): DailyIdeasStreak {
  const days = [...new Set(activeDays.filter(isDateString))].sort();
  if (!days.length) {
    return { current: 0, longest: 0, totalDays: 0, lastActiveDate: null, timezone };
  }

  let longest = 1;
  let run = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (previousDateString(days[index]) === days[index - 1]) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  const today = localDateString(now, timezone);
  const yesterday = previousDateString(today);
  const set = new Set(days);
  const lastActiveDate = days[days.length - 1];
  let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current += 1;
    cursor = previousDateString(cursor);
  }

  return {
    current,
    longest,
    totalDays: days.length,
    lastActiveDate,
    timezone,
  };
}

function summaryFor(state: EngagementState, timezone: string, now = new Date()): DailyIdeasEngagementSummary {
  const totals = {
    deliveries: 0,
    opens: 0,
    saves: 0,
    develops: 0,
    shares: 0,
    feedback: 0,
  };
  for (const event of state.events) {
    if (event.kind === "delivery") totals.deliveries += 1;
    else if (event.kind === "open") totals.opens += 1;
    else if (event.kind === "save") totals.saves += 1;
    else if (event.kind === "develop") totals.develops += 1;
    else if (event.kind === "share") totals.shares += 1;
    else if (event.kind === "feedback") totals.feedback += 1;
  }
  return {
    streak: calculateStreak(state.activeDays, timezone, now),
    totals,
    updatedAt: state.updatedAt,
  };
}

async function withSubjectLock<T>(subject: string, run: () => Promise<T>) {
  const redis = getWorkspaceRedis();
  const token = randomUUID();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await redis.setIfAbsent(lockKey(subject), token, LOCK_TTL_SECONDS)) {
      try {
        return await run();
      } finally {
        await redis.deleteIfValue(lockKey(subject), token).catch(() => false);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 30 + attempt * 20));
  }
  throw new Error("Daily Ideas engagement state is busy");
}

export async function getDailyIdeasEngagement(subject: string, timezone?: string | null) {
  const normalizedTimezone = normalizeTimezone(timezone);
  const stored = await getWorkspaceRedis().get<EngagementState>(stateKey(subject));
  return summaryFor(normalizeState(stored), normalizedTimezone);
}

export async function getDailyIdeaForEngagement(ideaId: string) {
  if (!isIdeaId(ideaId)) return null;
  return getStoredDailyIdea(ideaId);
}

export async function recordDailyIdeasEngagement(
  subject: string,
  input: {
    eventId: string;
    kind: DailyIdeasEngagementKind;
    ideaId?: string | null;
    rating?: DailyIdeasFeedbackRating | null;
    message?: string | null;
    timezone?: string | null;
  },
) {
  if (!/^[A-Za-z0-9:_-]{1,100}$/.test(input.eventId) || !isKind(input.kind)) return null;
  const ideaId = input.ideaId?.trim() || null;
  if (ideaId && !isIdeaId(ideaId)) return null;
  if (input.kind === "feedback" && (!ideaId || !isRating(input.rating))) return null;
  if (input.kind !== "feedback" && input.rating !== undefined && input.rating !== null) return null;
  const message = input.message?.trim().slice(0, 280) || null;
  if (input.kind === "product-feedback" && !message) return null;
  if (input.kind !== "product-feedback" && message) return null;
  if (ideaId && !await getStoredDailyIdea(ideaId)) return null;

  const timezone = normalizeTimezone(input.timezone);
  return withSubjectLock(subject, async () => {
    const redis = getWorkspaceRedis();
    const state = normalizeState(await redis.get<EngagementState>(stateKey(subject)));
    if (state.events.some((event) => event.eventId === input.eventId) ||
        state.productFeedback.some((entry) => entry.eventId === input.eventId)) {
      return { created: false, engagement: summaryFor(state, timezone) };
    }

    const now = new Date();
    const createdAt = now.toISOString();
    if (input.kind === "product-feedback") {
      state.productFeedback = [
        ...state.productFeedback,
        { eventId: input.eventId, message: message!, createdAt },
      ].slice(-MAX_PRODUCT_FEEDBACK);
    } else {
      const event: EngagementEvent = {
        eventId: input.eventId,
        kind: input.kind,
        ideaId,
        rating: input.kind === "feedback" ? input.rating! : null,
        createdAt,
      };
      state.events = [...state.events, event].slice(-MAX_EVENTS);
      if (ideaId && !state.firstOpenedAt[ideaId] && input.kind !== "delivery") {
        state.firstOpenedAt[ideaId] = createdAt;
      }
      if (input.kind === "feedback" && ideaId) {
        state.feedbackByIdea[ideaId] = { rating: input.rating!, updatedAt: createdAt };
      }
      if (MEANINGFUL_KINDS.has(input.kind)) {
        const day = localDateString(now, timezone);
        state.activeDays = [...new Set([...state.activeDays, day])].sort().slice(-MAX_ACTIVE_DAYS);
      }
    }
    state.updatedAt = createdAt;
    await redis.set(stateKey(subject), state);
    return { created: true, engagement: summaryFor(state, timezone, now) };
  });
}
