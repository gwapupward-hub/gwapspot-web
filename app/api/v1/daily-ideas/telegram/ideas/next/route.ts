import { NextResponse } from "next/server";
import {
  DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
  MIN_INTERNAL_API_KEY_LENGTH,
  getTelegramActor,
  isValidInternalApiKey,
  normalizeTelegramAccountInput,
} from "../../../../../../lib/daily-ideas-telegram-account-core";
import {
  parseDailyIdeaCategory,
  parseDailyIdeaFocus,
  parseDailyIdeaMode,
} from "../../../../../../lib/daily-ideas-core";
import {
  DailyIdeasConfigurationError,
  DailyIdeasProviderError,
  getDailyIdeasConfiguration,
} from "../../../../../../lib/daily-ideas-generator";
import { getNextDailyIdea } from "../../../../../../lib/daily-ideas-inventory";
import { checkRateLimit } from "../../../../../../lib/request-guard";

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

async function readBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const configuration = getDailyIdeasConfiguration();
  return json({
    ok: true,
    service: "daily-ideas-telegram-next-idea",
    contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
    configured: configuration.configured,
    model: configuration.model,
  });
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (request.headers.get("x-daily-ideas-contract-version") !== DAILY_IDEAS_SERVICE_CONTRACT_VERSION) {
    return json({ error: "Contract version mismatch", requestId }, 409);
  }

  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request", requestId }, 400);
  const account = normalizeTelegramAccountInput({ telegramUserId: body.telegramUserId });
  if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);

  const category = parseDailyIdeaCategory(body.category);
  const mode = parseDailyIdeaMode(body.mode);
  const focus = parseDailyIdeaFocus(body.focus);
  const rate = await checkRateLimit(`daily-ideas-telegram-next:${account.telegramUserId}`, 20, 24 * 60 * 60 * 1_000);
  if (!rate.allowed) {
    return json(
      { error: "Daily idea request limit reached", requestId },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const result = await getNextDailyIdea({
      subject: `telegram:${account.telegramUserId}`,
      category,
      mode,
      focus,
    });
    console.info("daily_ideas_telegram_idea_delivered", {
      requestId,
      actor: getTelegramActor(account.telegramUserId),
      ideaId: result.idea.id,
      category: result.idea.category,
      mode,
      source: result.delivery.source,
    });
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ...result });
  } catch (error) {
    const configurationError = error instanceof DailyIdeasConfigurationError;
    console.error("daily_ideas_telegram_idea_failed", {
      requestId,
      actor: getTelegramActor(account.telegramUserId),
      name: error instanceof Error ? error.name : "Error",
    });
    const status = configurationError ? 503 : error instanceof DailyIdeasProviderError ? 502 : 503;
    return json({ error: "The idea engine did not finish that one. Try again.", requestId }, status);
  }
}
