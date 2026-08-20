import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createDailyIdeaHandoff } from "../../../lib/daily-ideas-handoff";
import { getDailyIdeasSubjectForTelegram } from "../../../lib/daily-ideas-identity-link";
import { getNextDailyIdea } from "../../../lib/daily-ideas-inventory";
import { getDailyIdeasPreferences, updateDailyIdeasPreferences } from "../../../lib/daily-ideas-preferences";
import {
  getDailyIdeasConfiguration,
} from "../../../lib/daily-ideas-generator";
import {
  parseDailyIdeaCategory,
  type DailyIdeaCategory,
  type GeneratedDailyIdea,
} from "../../../lib/daily-ideas-core";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../../lib/redis";
import { checkRateLimit } from "../../../lib/request-guard";

export const runtime = "nodejs";

const TELEGRAM_API = "https://api.telegram.org";
const DEFAULT_APP_URL = "https://www.gwapspot.com/telegram";

type TelegramUser = { id: number; first_name?: string; username?: string };
type TelegramMessage = { message_id: number; chat: { id: number; type?: string }; from?: TelegramUser; text?: string };
type TelegramCallbackQuery = { id: string; from: TelegramUser; data?: string; message?: TelegramMessage };
type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery };
type TelegramPreferences = { category: DailyIdeaCategory; updatedAt: string };
type InlineButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };
type InlineKeyboard = { inline_keyboard: InlineButton[][] };

function getTelegramConfig() {
  const dedicatedBotToken = process.env.DAILY_IDEAS_TELEGRAM_BOT_TOKEN?.trim();
  const legacyBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const dedicatedWebhookSecret = process.env.DAILY_IDEAS_TELEGRAM_WEBHOOK_SECRET?.trim();
  const genericWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const botToken = dedicatedBotToken || legacyBotToken;
  const webhookSecret = dedicatedWebhookSecret || genericWebhookSecret;
  const appUrl = process.env.DAILY_IDEAS_TELEGRAM_APP_URL?.trim() || DEFAULT_APP_URL;

  return {
    botToken,
    webhookSecret,
    appUrl,
    botTokenSource: dedicatedBotToken ? ("daily-ideas" as const) : legacyBotToken ? ("legacy" as const) : null,
    webhookSecretSource: dedicatedWebhookSecret ? ("daily-ideas" as const) : genericWebhookSecret ? ("generic" as const) : null,
  };
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
  const labels: Partial<Record<DailyIdeaCategory, string>> = {
    web3: "Web3",
    solana: "Solana",
    saas: "SaaS",
    ai: "AI & Agents",
    "developer-tools": "Developer Tools",
    "creator-economy": "Creator Economy",
    b2b: "B2B",
    general: "General",
    "gwap-ecosystem": "GWAP Ecosystem",
  };
  return labels[category] || category.replaceAll("-", " ");
}

function miniAppButton(text: string, url: string, privateChat: boolean): InlineButton {
  return privateChat ? { text, web_app: { url } } : { text, url };
}

function categoryKeyboard(appUrl: string, privateChat: boolean): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "🌐 Web3", callback_data: "category:web3" }, { text: "🤖 AI", callback_data: "category:ai" }],
      [{ text: "💼 SaaS", callback_data: "category:saas" }, { text: "🎯 General", callback_data: "category:general" }],
      [miniAppButton("Open Daily Ideas 2.0", appUrl, privateChat)],
    ],
  };
}

function ideaKeyboard(destinationUrl: string, privateChat: boolean): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "🔄 Another idea", callback_data: "idea:generate" }],
      [miniAppButton("Open in Daily Ideas 2.0", destinationUrl, privateChat)],
    ],
  };
}

function handoffUrl(appUrl: string, token: string) {
  try {
    const url = new URL(appUrl);
    url.searchParams.set("handoff", token);
    url.searchParams.set("source", "telegram");
    return url.toString();
  } catch {
    return `${DEFAULT_APP_URL}?handoff=${encodeURIComponent(token)}&source=telegram`;
  }
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
    link_preview_options: { is_disabled: true },
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
  if (stored?.category) {
    return { category: parseDailyIdeaCategory(stored.category), updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : "" };
  }

  const subject = await getDailyIdeasSubjectForTelegram(String(userId));
  const shared = await getDailyIdeasPreferences(subject);
  return { category: parseDailyIdeaCategory(shared.categories[0]), updatedAt: shared.updatedAt };
}

async function saveCategory(userId: number, category: DailyIdeaCategory) {
  const redis = getWorkspaceRedis();
  const key = getPrivateStorageKey("telegram-ideas-preferences", String(userId));
  const subject = await getDailyIdeasSubjectForTelegram(String(userId));
  await Promise.all([
    redis.set<TelegramPreferences>(key, { category, updatedAt: new Date().toISOString() }),
    updateDailyIdeasPreferences(subject, { categories: [category] }),
  ]);
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
    `📊 ${escapeHtml(idea.difficulty)} · ${escapeHtml(categoryLabel(idea.category))}`,
  ].join("\n");
}

async function generateForTelegram(token: string, appUrl: string, chatId: number, userId: number, privateChat: boolean) {
  const rate = await checkRateLimit(`telegram-daily-ideas:${userId}`, 6, 60_000);
  if (!rate.allowed) {
    await sendMessage(token, chatId, "You’ve reached the idea limit for this minute. Try again shortly.");
    return;
  }

  const preferences = await getPreferences(userId);
  try {
    const subject = await getDailyIdeasSubjectForTelegram(String(userId));
    const result = await getNextDailyIdea({ subject, category: preferences.category, mode: "idea" });
    const idea = result.idea;
    let destinationUrl = appUrl;
    try {
      const handoffToken = await createDailyIdeaHandoff(idea);
      destinationUrl = handoffUrl(appUrl, handoffToken);
    } catch {
      console.error("daily_ideas_handoff_create_failed");
    }
    await sendMessage(token, chatId, formatIdea(idea), ideaKeyboard(destinationUrl, privateChat));
  } catch (error) {
    console.error("daily_ideas_telegram_generate_failed", {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
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
  const privateChat = message.chat.type === "private" || message.chat.type === undefined;

  if (command === "/start") {
    const name = escapeHtml(message.from.first_name || "builder");
    await sendMessage(
      token,
      message.chat.id,
      `Welcome to <b>Daily Ideas 2.0 by GWAP</b>, ${name}.\n\nDiscover an opportunity here, then open the Mini App to save, develop, validate, build, and launch it without leaving Telegram.`,
      categoryKeyboard(appUrl, privateChat),
    );
    return;
  }

  if (command === "/help") {
    await sendMessage(token, message.chat.id, [
      "<b>Daily Ideas 2.0</b>", "", "/idea — generate an idea now", "/category — choose your opportunity lane", "/help — show this guide", "",
      "The bot and Mini App share the same Daily Ideas account state. Link GWAP OS when you want your Telegram ideas and projects to follow your GWAP identity.",
    ].join("\n"), { inline_keyboard: [[miniAppButton("Open Daily Ideas 2.0", appUrl, privateChat)]] });
    return;
  }

  if (command === "/category") {
    const preferences = await getPreferences(message.from.id);
    await sendMessage(token, message.chat.id, `Current category: <b>${escapeHtml(categoryLabel(preferences.category))}</b>\n\nChoose your Daily Ideas lane:`, categoryKeyboard(appUrl, privateChat));
    return;
  }

  if (command === "/idea") await generateForTelegram(token, appUrl, message.chat.id, message.from.id, privateChat);
}

async function handleCallback(token: string, appUrl: string, callback: TelegramCallbackQuery) {
  const chatId = callback.message?.chat.id;
  const privateChat = callback.message?.chat.type === "private" || callback.message?.chat.type === undefined;
  if (!chatId || !callback.data) {
    await answerCallback(token, callback.id);
    return;
  }

  if (callback.data.startsWith("category:")) {
    const category = parseDailyIdeaCategory(callback.data.slice("category:".length));
    await saveCategory(callback.from.id, category);
    await answerCallback(token, callback.id, `${categoryLabel(category)} selected`);
    await sendMessage(token, chatId, `Category saved: <b>${escapeHtml(categoryLabel(category))}</b>. Use /idea whenever you want a new opportunity.`, {
      inline_keyboard: [[{ text: "💡 Get an idea", callback_data: "idea:generate" }], [miniAppButton("Open Daily Ideas 2.0", appUrl, privateChat)]],
    });
    return;
  }

  if (callback.data === "idea:generate") {
    await answerCallback(token, callback.id, "Generating…");
    await generateForTelegram(token, appUrl, chatId, callback.from.id, privateChat);
    return;
  }

  await answerCallback(token, callback.id);
}

export async function GET() {
  const telegram = getTelegramConfig();
  const ai = getDailyIdeasConfiguration();
  const components = {
    botToken: Boolean(telegram.botToken),
    webhookSecret: Boolean(telegram.webhookSecret),
    ai: ai.configured,
  };

  return NextResponse.json({
    service: "daily-ideas-telegram",
    configured: components.botToken && components.webhookSecret && components.ai,
    mode: "webhook+mini-app",
    appUrl: telegram.appUrl,
    components,
    botTokenSource: telegram.botTokenSource,
    webhookSecretSource: telegram.webhookSecretSource,
    model: ai.model,
    capabilities: ["start", "help", "idea", "category", "mini-app", "handoff", "shared-state"],
  });
}

export async function POST(request: Request) {
  const { botToken, webhookSecret, appUrl } = getTelegramConfig();
  if (!botToken || !webhookSecret) {
    const missing = [
      ...(!botToken ? ["telegram bot token"] : []),
      ...(!webhookSecret ? ["telegram webhook secret"] : []),
    ];
    console.error("daily_ideas_telegram_configuration_error", { missing });
    return NextResponse.json({ error: `Daily Ideas Telegram is not configured: missing ${missing.join(" and ")}.` }, { status: 503 });
  }

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
  } catch (error) {
    if (claimKey) await releaseUpdate(claimKey);
    console.error("daily_ideas_telegram_update_failed", {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Update processing failed" }, { status: 500 });
  }
}
