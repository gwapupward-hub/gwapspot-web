import { createHmac, timingSafeEqual } from "node:crypto";

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

function normalizeTelegramUserId(value: unknown) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[1-9]\d{0,19}$/.test(normalized) ? normalized : "";
}

function normalizeLanguageCode(value: unknown) {
  const normalized = boundedText(value, 16);
  if (!normalized) return null;
  return /^[A-Za-z0-9_-]+$/.test(normalized) ? normalized : "";
}

function secureHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyTelegramMiniAppInitData(
  initData: unknown,
  options: { botToken: string; nowSeconds?: number; maxAgeSeconds?: number },
): VerifiedTelegramMiniAppIdentity | null {
  if (typeof initData !== "string" || !initData || Buffer.byteLength(initData, "utf8") > MAX_INIT_DATA_BYTES) return null;

  const botToken = options.botToken?.trim();
  if (!botToken) return null;

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash")?.trim() || "";
  if (!providedHash) return null;

  // Telegram's bot-token HMAC covers every received field except `hash`.
  // Bot API 9.x added `signature`; unlike Ed25519 third-party validation,
  // `signature` must remain in the HMAC data-check string.
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
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

  const userId = normalizeTelegramUserId(user.id);
  if (!userId) return null;
  const languageCode = normalizeLanguageCode(user.language_code);
  if (languageCode === "") return null;

  return {
    telegramUserId: userId,
    firstName: boundedText(user.first_name, 64) || "Builder",
    lastName: boundedText(user.last_name, 64) || null,
    username: boundedText(user.username, 32).replace(/^@+/, "") || null,
    languageCode,
    isPremium: user.is_premium === true,
    photoUrl: boundedText(user.photo_url, 1_024) || null,
    authDate,
    startParam: boundedText(params.get("start_param"), 128) || null,
  };
}
