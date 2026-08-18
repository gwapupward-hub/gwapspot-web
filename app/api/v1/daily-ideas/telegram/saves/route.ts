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
  listSavedDailyIdeas,
  saveDailyIdea,
  unsaveDailyIdea,
} from "../../../../../lib/daily-ideas-saves";
import { checkRateLimit } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
  "X-Daily-Ideas-Contract-Version": DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
};

function json(payload: unknown, status = 200, extraHeaders?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...extraHeaders } });
}
function requestIdFrom(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
}
function authorized(request: Request) {
  const key = process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() || "";
  return key.length >= MIN_INTERNAL_API_KEY_LENGTH && isValidInternalApiKey(request.headers.get("authorization"), key);
}
function hasContract(request: Request) {
  return request.headers.get("x-daily-ideas-contract-version") === DAILY_IDEAS_SERVICE_CONTRACT_VERSION;
}
function parseTelegramUserId(value: unknown) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return normalizeTelegramAccountInput({ telegramUserId: numeric });
}
async function readBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const url = new URL(request.url);
  const account = parseTelegramUserId(url.searchParams.get("telegramUserId"));
  if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || 5);
  try {
    const subject = await getDailyIdeasSubjectForTelegram(account.telegramUserId);
    const result = await listSavedDailyIdeas(subject, { offset, limit });
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ...result });
  } catch (error) {
    console.error("daily_ideas_telegram_saves_list_failed", { requestId, actor: getTelegramActor(account.telegramUserId), name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Saved ideas are temporarily unavailable", requestId }, 503);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request", requestId }, 400);
  const account = parseTelegramUserId(body.telegramUserId);
  const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : "";
  const action = body.action === "unsave" ? "unsave" : body.action === "save" ? "save" : null;
  if (!account || !action || !/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return json({ error: "Invalid save request", requestId }, 400);
  try {
    const rate = await checkRateLimit(`daily-ideas-telegram-saves:${account.telegramUserId}`, 60, 60_000);
    if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
    const subject = await getDailyIdeasSubjectForTelegram(account.telegramUserId);
    if (action === "unsave") {
      const result = await unsaveDailyIdea(subject, ideaId);
      console.info("daily_ideas_telegram_idea_unsaved", { requestId, actor: getTelegramActor(account.telegramUserId), ideaId, removed: result.removed });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ideaId, saved: false, ...result });
    }
    const result = await saveDailyIdea(subject, ideaId);
    if (!result.ok) return json({ error: "Idea not found", requestId }, 404);
    console.info("daily_ideas_telegram_idea_saved", { requestId, actor: getTelegramActor(account.telegramUserId), ideaId, created: result.created });
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ideaId, saved: true, created: result.created, savedAt: result.saved.savedAt }, result.created ? 201 : 200);
  } catch (error) {
    console.error("daily_ideas_telegram_saves_write_failed", { requestId, actor: getTelegramActor(account.telegramUserId), ideaId, action, name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Saved ideas are temporarily unavailable", requestId }, 503);
  }
}
