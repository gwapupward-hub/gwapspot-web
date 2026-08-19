import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VERIFICATION_CHALLENGE_TTL_MS = 30 * 60 * 1_000;
const CHALLENGE_PREFIX = "GS-X";

export function normalizeXUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidXUsername(value: string) {
  return /^[a-z0-9_]{1,15}$/.test(normalizeXUsername(value));
}

export function generateVerificationChallenge() {
  const token = randomBytes(6).toString("hex").toUpperCase();
  return `${CHALLENGE_PREFIX}-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}`;
}

export function normalizeChallengeText(value: string) {
  return value.trim().toUpperCase();
}

export function hashVerificationChallenge(value: string, secret?: string) {
  const normalized = normalizeChallengeText(value);
  return secret
    ? createHmac("sha256", secret).update(normalized).digest("hex")
    : createHash("sha256").update(normalized).digest("hex");
}

export function challengeHashesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function isChallengeExpired(expiresAt: string, now = Date.now()) {
  return new Date(expiresAt).getTime() <= now;
}

export function addMilliseconds(date: Date, milliseconds: number) {
  return new Date(date.getTime() + milliseconds).toISOString();
}
