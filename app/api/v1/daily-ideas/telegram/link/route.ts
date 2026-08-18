import { NextResponse } from "next/server";
import {
  DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
  MIN_INTERNAL_API_KEY_LENGTH,
  getTelegramActor,
  isValidInternalApiKey,
  normalizeTelegramAccountInput,
} from "../../../../../lib/daily-ideas-telegram-account-core";
import {
  createDailyIdeasAccountLinkToken,
  getDailyIdeasIdentityLinkForTelegram,
} from "../../../../../lib/daily-ideas-identity-link";
import { checkRateLimit } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function accountFrom(value: unknown) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return normalizeTelegramAccountInput({ telegramUserId: numeric });
}

function linkUrl(token: string) {
  const base = process.env.GWAPSPOT_URL?.trim() || "https://www.gwapspot.com";
  try {
    const url = new URL("/app/ideas", base);
    url.searchParams.set("link", token);
    return url.toString();
  } catch {
    return `https://www.gwapspot.com/app/ideas?link=${encodeURIComponent(token)}`;
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const account = accountFrom(body?.telegramUserId);
  const action = body?.action;
  if (!body || !account || (action !== "create" && action !== "status")) {
    return json({ error: "Invalid link request", requestId }, 400);
  }

  const rate = await checkRateLimit(`daily-ideas-link:${account.telegramUserId}`, 20, 60_000);
  if (!rate.allowed) {
    return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  try {
    const existing = await getDailyIdeasIdentityLinkForTelegram(account.telegramUserId);
    if (existing || action === "status") {
      return json({
        contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
        linked: Boolean(existing),
        identity: existing ? { gnsIdentity: existing.gnsIdentity, linkedAt: existing.linkedAt } : null,
      });
    }

    const issued = await createDailyIdeasAccountLinkToken(account.telegramUserId);
    if (!issued) return json({ error: "Telegram account not found", requestId }, 404);
    console.info("daily_ideas_telegram_account_link_issued", {
      requestId,
      actor: getTelegramActor(account.telegramUserId),
    });
    return json({
      contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
      linked: false,
      link: { url: linkUrl(issued.token), expiresAt: issued.expiresAt },
    }, 201);
  } catch (error) {
    console.error("daily_ideas_telegram_account_link_failed", {
      requestId,
      actor: getTelegramActor(account.telegramUserId),
      name: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "Account linking is temporarily unavailable", requestId }, 503);
  }
}
