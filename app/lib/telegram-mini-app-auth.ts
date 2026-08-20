import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeTelegramAccountInput } from "./daily-ideas-telegram-account-core";

const DEFAULT_MAX_AGE_SECONDS = 15 * 60;
const MAX_INIT_DATA_BYTES = 16_384;

type TelegramInitUser = {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
  language_code?: unknown;
  is_premium?: unknown;
  photo_url?: unknown;
};

export type VerifiedTelegramMiniAppIdentity = {
  telegramUserId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  isPremium: boolean;
  photoUrl: string | null;
  authDate: number;
  startParam: string | null;
};

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function secureHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getDailyIdeasTelegramBotToken() {
  return process.env.DAILY_IDEAS_TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export function verifyTelegramMiniAppInitData(
  initData: unknown,
  options: { botToken?: string; nowSeconds?: number; maxAgeSeconds?: number } = {},
): VerifiedTelegramMiniAppIdentity | null {
  if (typeof initData !== "string" || !initData || Buffer.byteLength(initData, "utf8") > MAX_INIT_DATA_BYTES) return null;

  const botToken = options.botToken?.trim() || getDailyIdeasTelegramBotToken();
  if (!botToken) return null;

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash")?.trim() || "";
  if (!providedHash) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!secureHexEqual(providedHash, expectedHash)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return null;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > maxAgeSeconds) return null;

  let user: TelegramInitUser;
  try {
    user = JSON.parse(params.get("user") || "null") as TelegramInitUser;
  } catch {
    return null;
  }
  if (!user || typeof user !== "object") return null;

  const normalized = normalizeTelegramAccountInput({
    telegramUserId: user.id,
    username: boundedText(user.username, 64) || undefined,
    firstName: boundedText(user.first_name, 80) || undefined,
    lastName: boundedText(user.last_name, 80) || undefined,
    languageCode: boundedText(user.language_code, 16) || undefined,
    isPremium: user.is_premium === true,
  });
  if (!normalized) return null;

  return {
    telegramUserId: normalized.telegramUserId,
    firstName: normalized.firstName || "Builder",
    lastName: normalized.lastName || null,
    username: normalized.username || null,
    languageCode: normalized.languageCode || null,
    isPremium: normalized.isPremium === true,
    photoUrl: boundedText(user.photo_url, 1_024) || null,
    authDate,
    startParam: boundedText(params.get("start_param"), 128) || null,
  };
}

export function getTelegramInitDataFromRequest(request: Request) {
  return request.headers.get("x-telegram-init-data")?.trim() || "";
}

export function verifyTelegramMiniAppRequest(request: Request) {
  return verifyTelegramMiniAppInitData(getTelegramInitDataFromRequest(request));
}
