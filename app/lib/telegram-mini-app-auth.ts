import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  verifyTelegramMiniAppInitData as verifyInitData,
  type VerifiedTelegramMiniAppIdentity,
} from "./telegram-mini-app-auth-core";

export type { VerifiedTelegramMiniAppIdentity } from "./telegram-mini-app-auth-core";

export const TELEGRAM_MINI_APP_SESSION_COOKIE = "__Host-gwap-tg-session";
export const TELEGRAM_MINI_APP_SESSION_MAX_AGE_SECONDS = 6 * 60 * 60;

type MiniAppSessionPayload = {
  v: 1;
  id: string;
  fn: string;
  ln: string | null;
  u: string | null;
  lc: string | null;
  p: boolean;
  ph: string | null;
  exp: number;
};

function sessionSecret(signingKey: string) {
  return createHmac("sha256", "GWAPTelegramMiniAppSession").update(signingKey).digest();
}

function secureTextEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request: Request, name: string) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function getDailyIdeasTelegramBotToken() {
  return process.env.DAILY_IDEAS_TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export function getTelegramMiniAppSessionSigningKey() {
  return process.env.TELEGRAM_MINI_APP_SESSION_SECRET?.trim() ||
    process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() ||
    getDailyIdeasTelegramBotToken();
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

function resolveSessionSigningKey(options: { signingKey?: string; botToken?: string }) {
  return options.signingKey?.trim() || options.botToken?.trim() || getTelegramMiniAppSessionSigningKey();
}

export function createTelegramMiniAppSession(
  identity: VerifiedTelegramMiniAppIdentity,
  options: { signingKey?: string; botToken?: string; nowSeconds?: number } = {},
) {
  const signingKey = resolveSessionSigningKey(options);
  if (!signingKey) return "";
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: MiniAppSessionPayload = {
    v: 1,
    id: identity.telegramUserId,
    fn: identity.firstName,
    ln: identity.lastName,
    u: identity.username,
    lc: identity.languageCode,
    p: identity.isPremium,
    ph: identity.photoUrl,
    exp: nowSeconds + TELEGRAM_MINI_APP_SESSION_MAX_AGE_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret(signingKey)).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyTelegramMiniAppSession(
  token: unknown,
  options: { signingKey?: string; botToken?: string; nowSeconds?: number } = {},
): VerifiedTelegramMiniAppIdentity | null {
  if (typeof token !== "string" || token.length < 40 || token.length > 4_000) return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const signingKey = resolveSessionSigningKey(options);
  if (!signingKey) return null;
  const expectedSignature = createHmac("sha256", sessionSecret(signingKey)).update(encoded).digest("base64url");
  if (!secureTextEqual(suppliedSignature, expectedSignature)) return null;

  let payload: MiniAppSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MiniAppSessionPayload;
  } catch {
    return null;
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    payload?.v !== 1 ||
    !/^[1-9]\d{0,19}$/.test(payload.id || "") ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= nowSeconds
  ) return null;

  return {
    telegramUserId: payload.id,
    firstName: typeof payload.fn === "string" && payload.fn ? payload.fn.slice(0, 64) : "Builder",
    lastName: typeof payload.ln === "string" ? payload.ln.slice(0, 64) : null,
    username: typeof payload.u === "string" ? payload.u.slice(0, 32) : null,
    languageCode: typeof payload.lc === "string" ? payload.lc.slice(0, 16) : null,
    isPremium: payload.p === true,
    photoUrl: typeof payload.ph === "string" ? payload.ph.slice(0, 1_024) : null,
    authDate: 0,
    startParam: null,
  };
}

export function getTelegramInitDataFromRequest(request: Request) {
  return request.headers.get("x-telegram-init-data")?.trim() || "";
}

export function verifyTelegramMiniAppRequest(request: Request) {
  const initData = getTelegramInitDataFromRequest(request);
  const verifiedLaunch = initData ? verifyTelegramMiniAppInitData(initData) : null;
  if (verifiedLaunch) return verifiedLaunch;
  return verifyTelegramMiniAppSession(cookieValue(request, TELEGRAM_MINI_APP_SESSION_COOKIE));
}
