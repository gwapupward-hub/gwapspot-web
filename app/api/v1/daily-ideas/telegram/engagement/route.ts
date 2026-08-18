import { NextResponse } from "next/server";
import {
  DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
  MIN_INTERNAL_API_KEY_LENGTH,
  getTelegramActor,
  isValidInternalApiKey,
  normalizeTelegramAccountInput,
} from "../../../../../lib/daily-ideas-telegram-account-core";
import { getDailyIdeasSubjectForTelegram } from "../../../../../lib/daily-ideas-identity-link";
import {
  getDailyIdeaForEngagement,
  getDailyIdeasEngagement,
  recordDailyIdeasEngagement,
  type DailyIdeasEngagementKind,
  type DailyIdeasFeedbackRating,
} from "../../../../../lib/daily-ideas-engagement";
import { getDailyIdeasDeliveryPreferences } from "../../../../../lib/daily-ideas-delivery";
import { checkRateLimit } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 4_096;
const responseHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex", "X-Daily-Ideas-Contract-Version": DAILY_IDEAS_SERVICE_CONTRACT_VERSION };
function json(payload: unknown, status = 200, extraHeaders?: HeadersInit) { return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...extraHeaders } }); }
function requestIdFrom(request: Request) { const supplied = request.headers.get("x-request-id")?.trim() || ""; return /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID(); }
function authorized(request: Request) { const key = process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() || ""; return key.length >= MIN_INTERNAL_API_KEY_LENGTH && isValidInternalApiKey(request.headers.get("authorization"), key); }
function hasContract(request: Request) { return request.headers.get("x-daily-ideas-contract-version") === DAILY_IDEAS_SERVICE_CONTRACT_VERSION; }
function accountFrom(value: unknown) { const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value; return normalizeTelegramAccountInput({ telegramUserId: numeric }); }
async function readBody(request: Request) { const declaredLength = Number(request.headers.get("content-length") || 0); if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null; const raw = await request.text(); if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null; try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } }
async function timezoneFor(telegramUserId: string) { const delivery = await getDailyIdeasDeliveryPreferences(telegramUserId); return delivery?.timezone || "UTC"; }

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const url = new URL(request.url);
  const account = accountFrom(url.searchParams.get("telegramUserId"));
  if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);
  const ideaId = url.searchParams.get("ideaId")?.trim() || "";
  if (ideaId && !/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return json({ error: "Invalid idea", requestId }, 400);
  try {
    const rate = await checkRateLimit(`daily-ideas-engagement-read:${account.telegramUserId}`, 90, 60_000);
    if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
    const subject = await getDailyIdeasSubjectForTelegram(account.telegramUserId);
    const [engagement, idea] = await Promise.all([
      getDailyIdeasEngagement(subject, await timezoneFor(account.telegramUserId)),
      ideaId ? getDailyIdeaForEngagement(ideaId) : Promise.resolve(null),
    ]);
    if (ideaId && !idea) return json({ error: "Idea not found", requestId }, 404);
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, engagement, ...(idea ? { idea } : {}) });
  } catch (error) {
    console.error("daily_ideas_telegram_engagement_read_failed", { requestId, actor: getTelegramActor(account.telegramUserId), name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Engagement data is temporarily unavailable", requestId }, 503);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request", requestId }, 400);
  const account = accountFrom(body.telegramUserId);
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const kind = typeof body.kind === "string" ? body.kind as DailyIdeasEngagementKind : null;
  const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : null;
  const rating = typeof body.rating === "string" ? body.rating as DailyIdeasFeedbackRating : null;
  const message = typeof body.message === "string" ? body.message : null;
  if (!account || !eventId || !kind) return json({ error: "Invalid engagement event", requestId }, 400);
  try {
    const rate = await checkRateLimit(`daily-ideas-engagement-write:${account.telegramUserId}`, 120, 60_000);
    if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
    const subject = await getDailyIdeasSubjectForTelegram(account.telegramUserId);
    const result = await recordDailyIdeasEngagement(subject, { eventId, kind, ideaId, rating, message, timezone: await timezoneFor(account.telegramUserId) });
    if (!result) return json({ error: "Invalid engagement event", requestId }, 400);
    console.info("daily_ideas_telegram_engagement_recorded", { requestId, actor: getTelegramActor(account.telegramUserId), kind, ...(ideaId ? { ideaId } : {}), ...(rating ? { rating } : {}), created: result.created });
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ...result }, result.created ? 201 : 200);
  } catch (error) {
    console.error("daily_ideas_telegram_engagement_write_failed", { requestId, actor: account ? getTelegramActor(account.telegramUserId) : "invalid", kind, name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Engagement data is temporarily unavailable", requestId }, 503);
  }
}
