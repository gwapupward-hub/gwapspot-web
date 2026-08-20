import { randomUUID } from "node:crypto";
import type { VerifiedTelegramMiniAppIdentity } from "./telegram-mini-app-auth-core";

export const TELEGRAM_MINI_APP_AUTH_CONTRACT_VERSION = "2026-08-01";
export const DEFAULT_TELEGRAM_MINI_APP_AUTH_URL = "https://daily-ideas.vercel.app/api/telegram/verify-mini-app";

export class TelegramMiniAppRemoteAuthError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "TelegramMiniAppRemoteAuthError";
    this.status = status;
  }
}

function nullableText(value: unknown, maxLength: number) {
  if (value === null) return null;
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function parseIdentity(value: unknown): VerifiedTelegramMiniAppIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const identity = value as Record<string, unknown>;
  const telegramUserId = typeof identity.telegramUserId === "string" ? identity.telegramUserId : "";
  const firstName = typeof identity.firstName === "string" ? identity.firstName : "";
  const lastName = nullableText(identity.lastName, 64);
  const username = nullableText(identity.username, 32);
  const languageCode = nullableText(identity.languageCode, 16);
  const photoUrl = nullableText(identity.photoUrl, 1_024);
  const startParam = nullableText(identity.startParam, 128);
  const authDate = Number(identity.authDate);

  if (
    !/^[1-9]\d{0,19}$/.test(telegramUserId) ||
    !firstName || firstName.length > 64 ||
    lastName === undefined ||
    username === undefined ||
    languageCode === undefined ||
    photoUrl === undefined ||
    startParam === undefined ||
    typeof identity.isPremium !== "boolean" ||
    !Number.isSafeInteger(authDate) ||
    authDate <= 0
  ) return null;

  return {
    telegramUserId,
    firstName,
    lastName,
    username,
    languageCode,
    isPremium: identity.isPremium,
    photoUrl,
    authDate,
    startParam,
  };
}

export async function verifyTelegramMiniAppInitDataRemotely(
  initData: unknown,
  options: {
    internalApiKey?: string;
    endpoint?: string;
    requestId?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<VerifiedTelegramMiniAppIdentity | null> {
  if (typeof initData !== "string" || !initData || Buffer.byteLength(initData, "utf8") > 16_384) return null;

  const internalApiKey = options.internalApiKey?.trim() || process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() || "";
  if (internalApiKey.length < 32) {
    throw new TelegramMiniAppRemoteAuthError("Daily Ideas internal authentication is not configured", 503);
  }

  const endpoint = options.endpoint?.trim() || process.env.DAILY_IDEAS_TELEGRAM_AUTH_URL?.trim() || DEFAULT_TELEGRAM_MINI_APP_AUTH_URL;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TelegramMiniAppRemoteAuthError("Telegram verification endpoint is invalid", 503);
  }
  if (url.protocol !== "https:") {
    throw new TelegramMiniAppRemoteAuthError("Telegram verification endpoint must use HTTPS", 503);
  }

  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${internalApiKey}`,
        "Content-Type": "application/json",
        "X-Daily-Ideas-Contract-Version": TELEGRAM_MINI_APP_AUTH_CONTRACT_VERSION,
        "X-Request-ID": options.requestId || randomUUID(),
      },
      body: JSON.stringify({ initData }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new TelegramMiniAppRemoteAuthError("Telegram verification service could not be reached", 503);
  }

  const payload = (await response.json().catch(() => null)) as
    | { contractVersion?: string; identity?: unknown; error?: string }
    | null;

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new TelegramMiniAppRemoteAuthError("Telegram verification service rejected the request", response.status);
  }
  if (payload?.contractVersion !== TELEGRAM_MINI_APP_AUTH_CONTRACT_VERSION) {
    throw new TelegramMiniAppRemoteAuthError("Telegram verification contract mismatch", 502);
  }

  const identity = parseIdentity(payload.identity);
  if (!identity) throw new TelegramMiniAppRemoteAuthError("Telegram verification service returned an invalid identity", 502);
  return identity;
}
