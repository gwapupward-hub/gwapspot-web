import { NextResponse } from "next/server";
import {
  DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
  MIN_INTERNAL_API_KEY_LENGTH,
  getTelegramActor,
  isValidInternalApiKey,
  normalizeTelegramAccountInput,
} from "../../../../../lib/daily-ideas-telegram-account-core";
import { upsertTelegramAccount } from "../../../../../lib/daily-ideas-telegram-account";
import { checkRateLimit } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
  "X-Daily-Ideas-Contract-Version": DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
};

function json(payload: unknown, status = 200, extraHeaders?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...responseHeaders, ...extraHeaders },
  });
}

function getInternalApiKey() {
  return (
    process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() ||
    process.env.INTERNAL_API_SECRET?.trim() ||
    ""
  );
}

function requestIdFrom(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
}

async function readBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: "Payload too large" as const, status: 413 };
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { error: "Payload too large" as const, status: 413 };
  }

  try {
    return { value: JSON.parse(raw) as unknown };
  } catch {
    return { error: "Invalid JSON" as const, status: 400 };
  }
}

export async function GET() {
  const internalApiKey = getInternalApiKey();
  return json({
    ok: true,
    service: "daily-ideas-telegram-users",
    contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
    configured: internalApiKey.length >= MIN_INTERNAL_API_KEY_LENGTH,
  });
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const internalApiKey = getInternalApiKey();

  if (internalApiKey.length < MIN_INTERNAL_API_KEY_LENGTH) {
    console.error("daily_ideas_internal_api_configuration_error", { requestId });
    return json({ error: "Service unavailable", requestId }, 503);
  }

  if (!isValidInternalApiKey(request.headers.get("authorization"), internalApiKey)) {
    return json({ error: "Unauthorized", requestId }, 401);
  }

  if (
    request.headers.get("x-daily-ideas-contract-version") !==
    DAILY_IDEAS_SERVICE_CONTRACT_VERSION
  ) {
    return json({ error: "Contract version mismatch", requestId }, 409);
  }

  const parsed = await readBody(request);
  if ("error" in parsed) return json({ error: parsed.error, requestId }, parsed.status);
  const input = normalizeTelegramAccountInput(parsed.value);
  if (!input) return json({ error: "Invalid Telegram account", requestId }, 400);

  try {
    const rate = await checkRateLimit(
      `daily-ideas-telegram-user:${input.telegramUserId}`,
      30,
      60_000,
    );
    if (!rate.allowed) {
      return json(
        { error: "Rate limit exceeded", requestId },
        429,
        { "Retry-After": String(rate.retryAfter) },
      );
    }

    const { created, record } = await upsertTelegramAccount(input);
    console.info("daily_ideas_telegram_user_upsert", {
      requestId,
      actor: getTelegramActor(input.telegramUserId),
      created,
    });

    return json(
      {
        contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
        user: {
          id: record.id,
          telegramUserId: record.telegramUserId,
          onboardingComplete: record.onboardingComplete,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      },
      created ? 201 : 200,
    );
  } catch (error) {
    console.error("daily_ideas_telegram_user_upsert_failed", {
      requestId,
      name: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "Telegram account storage is temporarily unavailable", requestId }, 503);
  }
}
