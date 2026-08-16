import { NextResponse } from "next/server";
import {
  DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
  MIN_INTERNAL_API_KEY_LENGTH,
  getTelegramActor,
  isValidInternalApiKey,
  normalizeTelegramAccountInput,
} from "../../../../../lib/daily-ideas-telegram-account-core";
import { listDailyIdeaHistory } from "../../../../../lib/daily-ideas-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
  "X-Daily-Ideas-Contract-Version": DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: responseHeaders });
}

function requestIdFrom(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function authorized(request: Request) {
  const key = process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() || "";
  return key.length >= MIN_INTERNAL_API_KEY_LENGTH && isValidInternalApiKey(request.headers.get("authorization"), key);
}

function accountFrom(value: unknown) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return normalizeTelegramAccountInput({ telegramUserId: numeric });
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (request.headers.get("x-daily-ideas-contract-version") !== DAILY_IDEAS_SERVICE_CONTRACT_VERSION) {
    return json({ error: "Contract version mismatch", requestId }, 409);
  }

  const url = new URL(request.url);
  const account = accountFrom(url.searchParams.get("telegramUserId"));
  if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);

  try {
    const result = await listDailyIdeaHistory(`telegram:${account.telegramUserId}`, {
      offset: Number(url.searchParams.get("offset") || 0),
      limit: Number(url.searchParams.get("limit") || 5),
    });
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ...result });
  } catch (error) {
    console.error("daily_ideas_telegram_history_failed", {
      requestId,
      actor: getTelegramActor(account.telegramUserId),
      name: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "Idea history is temporarily unavailable", requestId }, 503);
  }
}
