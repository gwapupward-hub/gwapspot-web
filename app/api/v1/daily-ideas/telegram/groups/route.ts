import { NextResponse } from "next/server";
import {
  DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
  MIN_INTERNAL_API_KEY_LENGTH,
  getTelegramActor,
  isValidInternalApiKey,
} from "../../../../../lib/daily-ideas-telegram-account-core";
import {
  claimDueDailyIdeasGroupDeliveries,
  completeDailyIdeasGroupDelivery,
  dailyIdeasGroupSubject,
  deactivateDailyIdeasGroup,
  getDailyIdeasGroup,
  installDailyIdeasGroup,
  isTelegramGroupChatId,
  recordDailyIdeasGroupVote,
  updateDailyIdeasGroupSettings,
} from "../../../../../lib/daily-ideas-groups";
import {
  DailyIdeasConfigurationError,
  DailyIdeasProviderError,
} from "../../../../../lib/daily-ideas-generator";
import { getNextDailyIdea } from "../../../../../lib/daily-ideas-inventory";
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

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

function normalizeTelegramUserId(value: unknown) {
  const candidate = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^[1-9]\d{0,19}$/.test(candidate) ? candidate : null;
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const chatId = new URL(request.url).searchParams.get("chatId") || "";
  if (!isTelegramGroupChatId(chatId)) return json({ error: "Invalid group", requestId }, 400);
  const group = await getDailyIdeasGroup(chatId);
  return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, group });
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const body = await readBody(request);
  if (!body || typeof body.action !== "string") return json({ error: "Invalid group request", requestId }, 400);

  try {
    if (body.action === "install") {
      const chatId = typeof body.chatId === "string" ? body.chatId : String(body.chatId || "");
      const adminId = normalizeTelegramUserId(body.adminTelegramUserId);
      if (!isTelegramGroupChatId(chatId) || !adminId) return json({ error: "Invalid group installation", requestId }, 400);
      const rate = await checkRateLimit(`daily-ideas-group-install:${chatId}`, 10, 60_000);
      if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
      const group = await installDailyIdeasGroup({
        chatId,
        chatType: body.chatType,
        title: body.title,
        installedByTelegramUserId: adminId,
      });
      if (!group) return json({ error: "Invalid group installation", requestId }, 400);
      console.info("daily_ideas_group_installed", { requestId, chatId, actor: getTelegramActor(adminId) });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, group }, 201);
    }

    if (body.action === "settings") {
      const chatId = typeof body.chatId === "string" ? body.chatId : String(body.chatId || "");
      const adminId = normalizeTelegramUserId(body.adminTelegramUserId);
      if (!isTelegramGroupChatId(chatId) || !adminId) return json({ error: "Invalid group settings", requestId }, 400);
      const rate = await checkRateLimit(`daily-ideas-group-settings:${chatId}`, 30, 60_000);
      if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
      const group = await updateDailyIdeasGroupSettings(chatId, {
        enabled: body.enabled,
        category: body.category,
        timezone: body.timezone,
        localHour: body.localHour,
        frequency: body.frequency,
      });
      if (!group) return json({ error: "Group is not installed or settings are invalid", requestId }, 400);
      console.info("daily_ideas_group_settings_updated", { requestId, chatId, actor: getTelegramActor(adminId), enabled: group.enabled, category: group.category, timezone: group.timezone, localHour: group.localHour, frequency: group.frequency });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, group });
    }

    if (body.action === "remove") {
      const chatId = typeof body.chatId === "string" ? body.chatId : String(body.chatId || "");
      if (!isTelegramGroupChatId(chatId)) return json({ error: "Invalid group", requestId }, 400);
      const group = await deactivateDailyIdeasGroup(chatId);
      console.info("daily_ideas_group_removed", { requestId, chatId, existed: Boolean(group) });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, group });
    }

    if (body.action === "vote") {
      const chatId = typeof body.chatId === "string" ? body.chatId : String(body.chatId || "");
      const voterId = normalizeTelegramUserId(body.telegramUserId);
      const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : "";
      const vote = body.vote === "yes" || body.vote === "maybe" || body.vote === "no" ? body.vote : null;
      if (!isTelegramGroupChatId(chatId) || !voterId || !vote || !/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) {
        return json({ error: "Invalid group vote", requestId }, 400);
      }
      const rate = await checkRateLimit(`daily-ideas-group-vote:${chatId}:${voterId}`, 30, 60_000);
      if (!rate.allowed) return json({ error: "Vote rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
      const result = await recordDailyIdeasGroupVote({ chatId, ideaId, telegramUserId: voterId, vote });
      if (!result) return json({ error: "Group voting is unavailable", requestId }, 404);
      console.info("daily_ideas_group_vote_recorded", { requestId, chatId, actor: getTelegramActor(voterId), ideaId, vote, total: result.counts.total });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ...result });
    }

    if (body.action === "idea") {
      const chatId = typeof body.chatId === "string" ? body.chatId : String(body.chatId || "");
      if (!isTelegramGroupChatId(chatId)) return json({ error: "Invalid group", requestId }, 400);
      const group = await getDailyIdeasGroup(chatId);
      if (!group?.active) return json({ error: "Group is not installed", requestId }, 404);
      const rate = await checkRateLimit(`daily-ideas-group-idea:${chatId}`, 20, 24 * 60 * 60 * 1_000);
      if (!rate.allowed) return json({ error: "Group idea request limit reached", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
      const result = await getNextDailyIdea({ subject: dailyIdeasGroupSubject(chatId), category: group.category, mode: "daily" });
      console.info("daily_ideas_group_idea_delivered", { requestId, chatId, ideaId: result.idea.id, category: result.idea.category, source: result.delivery.source });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ...result });
    }

    if (body.action === "claim") {
      const limit = typeof body.limit === "number" ? body.limit : 5;
      const deliveries = await claimDueDailyIdeasGroupDeliveries(new Date(), limit);
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, deliveries });
    }

    if (body.action === "complete") {
      const chatId = typeof body.chatId === "string" ? body.chatId : String(body.chatId || "");
      const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
      const success = body.success === true;
      const result = await completeDailyIdeasGroupDelivery({ chatId, deliveryId, success });
      if (!result) return json({ error: "Group delivery not found", requestId }, 404);
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, delivery: result });
    }

    return json({ error: "Unsupported group action", requestId }, 400);
  } catch (error) {
    const providerError = error instanceof DailyIdeasProviderError ? error : null;
    console.error("daily_ideas_group_request_failed", {
      requestId,
      action: body.action,
      name: error instanceof Error ? error.name : "Error",
      providerStatus: providerError?.providerStatus ?? null,
      providerCode: providerError?.providerCode ?? null,
    });
    return json(
      { error: error instanceof DailyIdeasConfigurationError || providerError ? "The idea engine did not finish that group request." : "Group request failed", requestId },
      providerError ? 502 : 503,
    );
  }
}
