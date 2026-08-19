import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  VERIFICATION_CARD_THEMES,
  type VerificationCardTheme,
} from "./types";

export const VERIFICATION_CHALLENGE_TTL_MS = 30 * 60 * 1_000;
export const GWAPSCORE_PUBLIC_ORIGIN = "https://www.gwapspot.com";
const CHALLENGE_PREFIX = "GS-X";
const CHALLENGE_PATTERN = /\bGS-X-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}\b/gi;

export function normalizeXUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidXUsername(value: string) {
  return /^[a-z0-9_]{1,15}$/.test(normalizeXUsername(value));
}

export function isVerificationCardTheme(value: unknown): value is VerificationCardTheme {
  return (
    typeof value === "string" &&
    (VERIFICATION_CARD_THEMES as readonly string[]).includes(value)
  );
}

export function generateVerificationChallenge() {
  const token = randomBytes(6).toString("hex").toUpperCase();
  return `${CHALLENGE_PREFIX}-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}`;
}

export function normalizeChallengeText(value: string) {
  return value.trim().toUpperCase();
}

export function extractVerificationChallenges(value: string) {
  return (value.match(CHALLENGE_PATTERN) ?? []).map(normalizeChallengeText);
}

export function buildVerificationShareUrl(
  challengeId: string,
  origin = GWAPSCORE_PUBLIC_ORIGIN,
) {
  return new URL(`/verify/x/${encodeURIComponent(challengeId)}`, origin).toString();
}

export function buildXVerificationPostText(
  username: string,
  challenge: string,
  shareUrl: string,
) {
  const handle = normalizeXUsername(username);
  return [
    `Verifying control of @${handle} for GwapScore.`,
    "",
    `Challenge: ${normalizeChallengeText(challenge)}`,
    "",
    "This post only proves account control.",
    "",
    shareUrl,
  ].join("\n");
}

export function buildXVerificationPostIntentUrl(
  username: string,
  challenge: string,
  shareUrl: string,
) {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set(
    "text",
    buildXVerificationPostText(username, challenge, shareUrl),
  );
  return url.toString();
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
