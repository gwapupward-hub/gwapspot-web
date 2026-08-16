import { createHash, timingSafeEqual } from "node:crypto";

export const DAILY_IDEAS_SERVICE_CONTRACT_VERSION = "2026-08-01";
export const MIN_INTERNAL_API_KEY_LENGTH = 32;

export type TelegramAccountInput = {
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
};

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
}

function normalizeTelegramUserId(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[1-9]\d{0,19}$/.test(normalized) ? normalized : null;
}

export function normalizeTelegramAccountInput(value: unknown): TelegramAccountInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const telegramUserId = normalizeTelegramUserId(input.telegramUserId);
  if (!telegramUserId) return null;

  const username = optionalText(input.username, 32)?.replace(/^@+/, "") || null;
  const languageCode = optionalText(input.languageCode, 16);
  if (languageCode && !/^[A-Za-z0-9_-]+$/.test(languageCode)) return null;

  return {
    telegramUserId,
    username,
    firstName: optionalText(input.firstName, 64),
    lastName: optionalText(input.lastName, 64),
    languageCode,
  };
}

export function getTelegramAccountId(telegramUserId: string) {
  const digest = createHash("sha256").update(telegramUserId).digest("hex").slice(0, 32);
  return `telegram_${digest}`;
}

export function getTelegramActor(telegramUserId: string) {
  return createHash("sha256").update(telegramUserId).digest("hex").slice(0, 12);
}

export function isValidInternalApiKey(authorization: string | null, expected: string | undefined) {
  const configured = expected?.trim() || "";
  if (configured.length < MIN_INTERNAL_API_KEY_LENGTH || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = authorization.slice("Bearer ".length);
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}
