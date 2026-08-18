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
  claimDueDailyIdeasDeliveries,
  completeDailyIdeasDelivery,
  getDailyIdeasDeliveryPreferences,
  updateDailyIdeasDeliveryPreferences,
} from "../../../../../lib/daily-ideas-delivery";
import { getDailyIdeasPreferences } from "../../../../../lib/daily-ideas-preferences";
import { checkRateLimit } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex", "X-Daily-Ideas-Contract-Version": DAILY_IDEAS_SERVICE_CONTRACT_VERSION };
function json(payload: unknown, status = 200, extraHeaders?: HeadersInit) { return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...extraHeaders } }); }
function requestIdFrom(request: Request) { const supplied = request.headers.get("x-request-id")?.trim() || ""; return /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID(); }
function authorized(request: Request) { const key = process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() || ""; return key.length >= MIN_INTERNAL_API_KEY_LENGTH && isValidInternalApiKey(request.headers.get("authorization"), key); }
function hasContract(request: Request) { return request.headers.get("x-daily-ideas-contract-version") === DAILY_IDEAS_SERVICE_CONTRACT_VERSION; }
function accountFrom(value: unknown) { const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value; return normalizeTelegramAccountInput({ telegramUserId: numeric }); }

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const account = accountFrom(new URL(request.url).searchParams.get("telegramUserId"));
  if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);
  try {
    const delivery = await getDailyIdeasDeliveryPreferences(account.telegramUserId);
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, delivery });
  } catch (error) {
    console.error("daily_ideas_telegram_delivery_read_failed", { requestId, actor: getTelegramActor(account.telegramUserId), name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Delivery preferences are temporarily unavailable", requestId }, 503);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return json({ error: "Invalid request", requestId }, 400);
  try {
    if (body.action === "preferences") {
      const account = accountFrom(body.telegramUserId);
      if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);
      const rate = await checkRateLimit(`daily-ideas-delivery-preferences:${account.telegramUserId}`, 30, 60_000);
      if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
      const delivery = await updateDailyIdeasDeliveryPreferences(account.telegramUserId, { enabled: body.enabled, timezone: body.timezone, localHour: body.localHour, frequency: body.frequency });
      if (!delivery) return json({ error: "Invalid delivery preferences", requestId }, 400);
      console.info("daily_ideas_telegram_delivery_preferences_updated", { requestId, actor: getTelegramActor(account.telegramUserId), enabled: delivery.enabled, timezone: delivery.timezone, localHour: delivery.localHour, frequency: delivery.frequency });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, delivery });
    }
    if (body.action === "claim") {
      const rate = await checkRateLimit("daily-ideas-delivery-claim", 12, 60_000);
      if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
      const limit = typeof body.limit === "number" ? body.limit : 10;
      const claimed = await claimDueDailyIdeasDeliveries(new Date(), limit);
      const deliveries = await Promise.all(claimed.map(async (delivery) => {
        const subject = await getDailyIdeasSubjectForTelegram(delivery.telegramUserId);
        const preferences = await getDailyIdeasPreferences(subject);
        const category = preferences.categories.find((item) => item !== "general") || preferences.categories[0] || "general";
        return { ...delivery, category };
      }));
      console.info("daily_ideas_telegram_delivery_claimed", { requestId, count: deliveries.length });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, deliveries });
    }
    if (body.action === "complete") {
      const account = accountFrom(body.telegramUserId);
      if (!account || typeof body.deliveryId !== "string" || typeof body.success !== "boolean") return json({ error: "Invalid delivery completion", requestId }, 400);
      const record = await completeDailyIdeasDelivery({ telegramUserId: account.telegramUserId, deliveryId: body.deliveryId, success: body.success });
      if (!record) return json({ error: "Unknown delivery", requestId }, 404);
      console.info("daily_ideas_telegram_delivery_completed", { requestId, actor: getTelegramActor(account.telegramUserId), deliveryId: body.deliveryId, success: body.success });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, delivery: record });
    }
    return json({ error: "Unsupported delivery action", requestId }, 400);
  } catch (error) {
    console.error("daily_ideas_telegram_delivery_failed", { requestId, action: body.action, name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Scheduled delivery is temporarily unavailable", requestId }, 503);
  }
}
