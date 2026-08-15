import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  DailyIdeasConfigurationError,
  generateDailyIdea,
  parseDailyIdeaCategory,
  type DailyIdeaCategory,
  type GeneratedDailyIdea,
} from "../../../lib/daily-ideas-generator";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../../lib/redis";
import { checkRateLimit } from "../../../lib/request-guard";

export const runtime = "nodejs";

const TELEGRAM_API = "https://api.telegram.org";
const DEFAULT_APP_URL = "https://www.gwapspot.com/app/ideas";

type TelegramUser = { id: number; first_name?: string; username?: string };
type TelegramMessage = { message_id: number; chat: { id: number }; from?: TelegramUser; text?: string };
type TelegramCallbackQuery = { id: string; from: TelegramUser; data?: string; message?: TelegramMessage };
type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery };
type TelegramPreferences = { category: DailyIdeaCategory; updatedAt: string };
type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> };

function getTelegramConfig() {
  const botToken = process.env.DAILY_IDEAS_TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = process.env.DAILY_IDEAS_TELEGRAM_WEBHOOK_SECRET?.trim();
  const appUrl = process.env.DAILY_IDEAS_TELEGRAM_APP_URL?.trim() || DEFAULT_APP_URL;
  return { botToken, webhookSecret, appUrl };
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function categoryLabel(category: DailyIdeaCategory) {
  return category === "web3" ? "Web3" : category === "saas" ? "SaaS" : category === "ai" ? "AI" : "General";
}

function categoryKeyboard(appUrl: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "🌐 Web3", callback_data: "category:web3" }, { text: "🤖 AI", callback_data: "category:ai" }],
      [{ text: "💼 SaaS", callback_data: "category:saas" }, { text: "🎯 General", callback_data: "category:general" }],
      [{ text: "Open Daily Ideas in GWAP OS", url: appUrl }],
    ],
  };
}

function ideaKeyboard(appUrl: string): InlineKeyboard {
  return { inline_keyboard: [[{ text: "🔄 Another idea", callback_data: "idea:generate" }], [{ text: "Develop in GWAP OS", url: appUrl }]] };
}

async function telegramRequest<T>(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Telegram API returned ${response.status}`);
  const result = (await response.json()) as { ok?: boolean; result?: T };
  if (!result.ok) throw new Error("Telegram API rejected request");
  return result.result as T;
}

function sendMessage(token: string, chatId: number, text: string, replyMarkup?: InlineKeyboard) {
  return telegramRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function answerCallback(token: string, callbackQueryId: string, text?: string) {
  return telegramRequest(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}

async function getPreferences(userId: number): Promise<TelegramPreferences> {
  const redis = getWorkspaceRedis();
  const key = getPrivateStorageKey("telegram-ideas-preferences", String(userId));
  const stored = await redis.get<Partial<TelegramPreferences>>(key);
  return { category: parseDailyIdeaCategory(stored?.category), updatedAt: typeof stored?.updatedAt === "string" ? stored.updatedAt : "" };
}

async function saveCategory(userId: number, category: DailyIdeaCategory) {
  const redis = getWorkspaceRedis();
  const key = getPrivateStorageKey("telegram-ideas-preferences", String(userId));
  await redis.set<TelegramPreferences>(key, { category, updatedAt: new Date().toISOString() });
}

async function claimUpdate(updateId: number) {
  const redis = getWorkspaceRedis();
  const key = getPrivateStorageKey("telegram-ideas-update", String(updateId));
  const claimed = await redis.setIfAbsent(key, "processing", 60 * 60);
  return claimed ? key : null;
}

async function releaseUpdate(key: string) {
  try {
    await getWorkspaceRedis().deleteIfValue(key, "processing");
  } catch {
    console.error("daily_ideas_telegram_retry_release_failed");
  }
}

function formatIdea(idea: GeneratedDailyIdea) {
  return [
    `💡 <b>${escapeHtml(idea.title)}</b>`,
    "",
    escapeHtml(idea.summary),
    "",
    `<b>Problem:</b> ${escapeHtml(idea.problem)}`,
    `<b>Opportunity:</b> ${escapeHtml(idea.opportunity)}`,
    "",
    `📊 ${escapeHtml(idea.difficulty)} · ${categoryLabel(idea.category)}`,
  ].join("\n");
}

async function generateForTelegram(token: string, appUrl: string, chatId: number, userId: number) {
  const rate = await checkRateLimit(`telegram-daily-ideas:${userId}`, 6, 60_000);
  if (!rate.allowed) {
    await sendMessage(token, chatId, "You’ve reached the idea limit for this minute. Try again shortly.");
    return;
  }

  const preferences = await getPreferences(userId);
  try {
    const idea = await generateDailyIdea(preferences.category);
    await sendMessage(token, chatId, formatIdea(idea), ideaKeyboard(appUrl));
  } catch (error) {
    if (error instanceof DailyIdeasConfigurationError) {
      await sendMessage(token, chatId, "Daily Ideas AI is not configured yet. You can still open the GWAP OS workspace below.", {
        inline_keyboard: [[{ text: "Open Daily Ideas in GWAP OS", url: appUrl }]],
      });
      return;
    }
    await sendMessage(token, chatId, "Daily Ideas could not generate an idea right now. Try again shortly.");
  }
}

function commandFrom(text: string | undefined) {
  const command = text?.trim().split(/\s+/, 1)[0]?.toLowerCase() || "";
  return command.split("@", 1)[0];
}

async function handleMessage(token: string, appUrl: string, message: TelegramMessage) {
  if (!message.from) return;
  const command = commandFrom(message.text);

  if (command === "/start") {
    const name = escapeHtml(message.from.first_name || "builder");
    await sendMessage(token, message.chat.id, `Welcome to <b>Daily Ideas by GWAP</b>, ${name}.\n\nChoose an opportunity lane, get an idea on demand, then open GWAP OS to save and develop it in Idea Lab.`, categoryKeyboard(appUrl));
    return;
  }

  if (command === "/help") {
    await sendMessage(token, message.chat.id, [
      "<b>Daily Ideas commands</b>", "", "/idea — generate an idea now", "/category — choose Web3, AI, SaaS, or General", "/help — show this guide", "",
      "Ideas are developed and saved inside GWAP OS. Telegram is a distribution client, not a separate account system.",
    ].join("\n"), { inline_keyboard: [[{ text: "Open GWAP OS", url: appUrl }]] });
    return;
  }

  if (command === "/category") {
    const preferences = await getPreferences(message.from.id);
    await sendMessage(token, message.chat.id, `Current category: <b>${categoryLabel(preferences.category)}</b>\n\nChoose your Daily Ideas lane:`, categoryKeyboard(appUrl));
    return;
  }

  if (command === "/idea") await generateForTelegram(token, appUrl, message.chat.id, message.from.id);
}

async function handleCallback(token: string, appUrl: string, callback: TelegramCallbackQuery) {
  const chatId = callback.message?.chat.id;
  if (!chatId || !callback.data) {
    await answerCallback(token, callback.id);
    return;
  }

  if (callback.data.startsWith("category:")) {
    const category = parseDailyIdeaCategory(callback.data.slice("category:".length));
    await saveCategory(callback.from.id, category);
    await answerCallback(token, callback.id, `${categoryLabel(category)} selected`);
    await sendMessage(token, chatId, `Category saved: <b>${categoryLabel(category)}</b>. Use /idea whenever you want a new opportunity.`, {
      inline_keyboard: [[{ text: "💡 Get an idea", callback_data: "idea:generate" }], [{ text: "Open GWAP OS", url: appUrl }]],
    });
    return;
  }

  if (callback.data === "idea:generate") {
    await answerCallback(token, callback.id, "Generating…");
    await generateForTelegram(token, appUrl, chatId, callback.from.id);
    return;
  }

  await answerCallback(token, callback.id);
}

export async function GET() {
  const { botToken, webhookSecret } = getTelegramConfig();
  return NextResponse.json({ service: "daily-ideas-telegram", configured: Boolean(botToken && webhookSecret), mode: "webhook", capabilities: ["start", "help", "idea", "category"] });
}

export async function POST(request: Request) {
  const { botToken, webhookSecret, appUrl } = getTelegramConfig();
  if (!botToken || !webhookSecret) return NextResponse.json({ error: "Daily Ideas Telegram is not configured" }, { status: 503 });

  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!providedSecret || !secureEqual(providedSecret, webhookSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }
  if (!Number.isSafeInteger(update.update_id)) return NextResponse.json({ error: "Invalid update" }, { status: 400 });

  let claimKey: string | null = null;
  try {
    claimKey = await claimUpdate(update.update_id);
    if (!claimKey) return NextResponse.json({ ok: true, duplicate: true });

    if (update.message) await handleMessage(botToken, appUrl, update.message);
    else if (update.callback_query) await handleCallback(botToken, appUrl, update.callback_query);

    return NextResponse.json({ ok: true });
  } catch {
    if (claimKey) await releaseUpdate(claimKey);
    console.error("daily_ideas_telegram_update_failed");
    return NextResponse.json({ error: "Update processing failed" }, { status: 500 });
  }
}
