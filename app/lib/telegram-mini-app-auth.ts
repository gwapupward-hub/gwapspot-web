import "server-only";

import {
  verifyTelegramMiniAppInitData as verifyInitData,
  type VerifiedTelegramMiniAppIdentity,
} from "./telegram-mini-app-auth-core";

export type { VerifiedTelegramMiniAppIdentity } from "./telegram-mini-app-auth-core";

export function getDailyIdeasTelegramBotToken() {
  return process.env.DAILY_IDEAS_TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export function verifyTelegramMiniAppInitData(
  initData: unknown,
  options: { botToken?: string; nowSeconds?: number; maxAgeSeconds?: number } = {},
): VerifiedTelegramMiniAppIdentity | null {
  const botToken = options.botToken?.trim() || getDailyIdeasTelegramBotToken();
  if (!botToken) return null;
  return verifyInitData(initData, {
    botToken,
    nowSeconds: options.nowSeconds,
    maxAgeSeconds: options.maxAgeSeconds,
  });
}

export function getTelegramInitDataFromRequest(request: Request) {
  return request.headers.get("x-telegram-init-data")?.trim() || "";
}

export function verifyTelegramMiniAppRequest(request: Request) {
  return verifyTelegramMiniAppInitData(getTelegramInitDataFromRequest(request));
}
