import "server-only";

import { randomBytes } from "node:crypto";
import { registerSnapshotSubject, unregisterSnapshotSubject } from "./gwapscore-snapshots";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

export const SOCIAL_PLATFORMS = ["x"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PUBLIC_PROOF_THEMES = [
  "green",
  "red",
  "blue",
  "purple",
  "silver",
  "orange",
] as const;
export type PublicProofTheme = (typeof PUBLIC_PROOF_THEMES)[number];

export type SocialVerificationMethod = "public-post";
export type SocialVerificationStatus =
  | "challenge-issued"
  | "awaiting-post"
  | "verified"
  | "revoked"
  | "expired";

export type SocialVerificationRecord = {
  accountId: string;
  platform: SocialPlatform;
  method: SocialVerificationMethod;
  socialHandle: string;
  challengeCode: string;
  shareTheme: PublicProofTheme;
  status: SocialVerificationStatus;
  issuedAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  revokedAt: string | null;
  externalAccountId: string | null;
  postUrl: string | null;
  postId: string | null;
  schemaVersion: 2;
};

export type PublicProofReceipt = {
  platform: SocialPlatform;
  method: SocialVerificationMethod;
  socialHandle: string;
  challengeCode: string;
  shareTheme: PublicProofTheme;
  status: SocialVerificationStatus;
  issuedAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  revokedAt: string | null;
  postUrl: string | null;
  schemaVersion: 1;
};

export type SocialPlatformConfig = {
  platform: SocialPlatform;
  label: string;
  officialHandle: string;
  verifierEnabled: boolean;
  verificationMethod: SocialVerificationMethod;
  challengeTtlMinutes: number;
  shareThemes: PublicProofTheme[];
};

type ChallengeLocator = {
  accountId: string;
  platform: SocialPlatform;
};

type XPostLookup = {
  data?: { id?: string; text?: string; author_id?: string };
  includes?: { users?: Array<{ id?: string; username?: string }> };
  errors?: unknown;
};

const CHALLENGE_TTL_SECONDS = 30 * 60;
const VERIFIED_TTL_SECONDS = 365 * 24 * 60 * 60;
const CHALLENGE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function verificationKey(accountId: string, platform: SocialPlatform) {
  return getPrivateStorageKey("social-proof-control", `${accountId}:${platform}`);
}
function challengeIndexKey(code: string) {
  return getPrivateStorageKey("social-proof-control-code", code);
}
function publicProofKey(code: string) {
  return getPrivateStorageKey("public-proof-receipt", code.toUpperCase());
}
function verifiedHandleKey(platform: SocialPlatform, handle: string) {
  return getPrivateStorageKey("social-proof-control-handle", `${platform}:${normalizeSocialHandle(handle)}`);
}
function verifiedExternalAccountKey(platform: SocialPlatform, accountId: string) {
  return getPrivateStorageKey("social-proof-control-external-account", `${platform}:${accountId.trim()}`);
}

/**
 * Snapshot collection is downstream evidence, never a precondition of Proof of
 * Control: a registry write that fails must not fail or reverse a verification.
 */
async function syncSnapshotSubject(record: SocialVerificationRecord) {
  if (record.status === "verified" && record.externalAccountId && record.verifiedAt) {
    await registerSnapshotSubject({
      accountId: record.accountId,
      platform: record.platform,
      externalAccountId: record.externalAccountId,
      socialHandle: record.socialHandle,
      verifiedAt: record.verifiedAt,
      challengeCode: record.challengeCode,
    }).catch(() => null);
    return;
  }
  await unregisterSnapshotSubject(record.accountId, record.platform).catch(() => false);
}

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}
export function isPublicProofTheme(value: unknown): value is PublicProofTheme {
  return typeof value === "string" && (PUBLIC_PROOF_THEMES as readonly string[]).includes(value);
}
export function normalizeSocialHandle(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}
export function isValidSocialHandle(platform: SocialPlatform, value: string) {
  const normalized = normalizeSocialHandle(value);
  if (platform === "x") return /^[a-z0-9_]{1,15}$/.test(normalized);
  return false;
}

function socialVerifierEnabled() {
  return (
    process.env.GWAPSCORE_SOCIAL_VERIFIER_ENABLED?.trim().toLowerCase() === "true" &&
    Boolean(process.env.GWAPSCORE_X_BEARER_TOKEN?.trim())
  );
}

export function getSocialPlatformConfig(platform: SocialPlatform): SocialPlatformConfig {
  if (platform === "x") {
    return {
      platform,
      label: "X",
      officialHandle: normalizeSocialHandle(process.env.GWAPSCORE_X_OFFICIAL_HANDLE || "_GwapSpot"),
      verifierEnabled: socialVerifierEnabled(),
      verificationMethod: "public-post",
      challengeTtlMinutes: CHALLENGE_TTL_SECONDS / 60,
      shareThemes: [...PUBLIC_PROOF_THEMES],
    };
  }
  return {
    platform,
    label: platform,
    officialHandle: "",
    verifierEnabled: false,
    verificationMethod: "public-post",
    challengeTtlMinutes: CHALLENGE_TTL_SECONDS / 60,
    shareThemes: [...PUBLIC_PROOF_THEMES],
  };
}

export function getSocialVerifierSecret() {
  return process.env.GWAPSCORE_SOCIAL_VERIFICATION_WEBHOOK_SECRET?.trim() || "";
}

function generateChallengeCode() {
  const bytes = randomBytes(8);
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) {
    value += CHALLENGE_ALPHABET[bytes[index] % CHALLENGE_ALPHABET.length];
  }
  return `GWAP-${value.slice(0, 4)}-${value.slice(4)}`;
}

function normalizeRecord(value: unknown): SocialVerificationRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<SocialVerificationRecord>;
  if (
    typeof record.accountId !== "string" ||
    !isSocialPlatform(record.platform) ||
    record.method !== "public-post" ||
    typeof record.socialHandle !== "string" ||
    typeof record.challengeCode !== "string" ||
    !isPublicProofTheme(record.shareTheme) ||
    !["challenge-issued", "awaiting-post", "verified", "revoked", "expired"].includes(record.status || "") ||
    typeof record.issuedAt !== "string" ||
    typeof record.expiresAt !== "string" ||
    record.schemaVersion !== 2
  ) return null;
  return record as SocialVerificationRecord;
}

function normalizePublicReceipt(value: unknown): PublicProofReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as Partial<PublicProofReceipt>;
  if (
    !isSocialPlatform(receipt.platform) ||
    receipt.method !== "public-post" ||
    typeof receipt.socialHandle !== "string" ||
    typeof receipt.challengeCode !== "string" ||
    !isPublicProofTheme(receipt.shareTheme) ||
    !["challenge-issued", "awaiting-post", "verified", "revoked", "expired"].includes(receipt.status || "") ||
    typeof receipt.issuedAt !== "string" ||
    typeof receipt.expiresAt !== "string" ||
    receipt.schemaVersion !== 1
  ) return null;
  return receipt as PublicProofReceipt;
}

function isExpired(record: SocialVerificationRecord) {
  return record.status !== "verified" && Date.now() >= Date.parse(record.expiresAt);
}

function toPublicReceipt(record: SocialVerificationRecord): PublicProofReceipt {
  return {
    platform: record.platform,
    method: record.method,
    socialHandle: record.socialHandle,
    challengeCode: record.challengeCode,
    shareTheme: record.shareTheme,
    status: record.status,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    verifiedAt: record.verifiedAt,
    revokedAt: record.revokedAt,
    postUrl: record.postUrl,
    schemaVersion: 1,
  };
}

async function saveRecord(record: SocialVerificationRecord) {
  const ttl = record.status === "verified" ? VERIFIED_TTL_SECONDS : CHALLENGE_TTL_SECONDS + 60;
  await Promise.all([
    getWorkspaceRedis().set(verificationKey(record.accountId, record.platform), record, { ex: ttl }),
    getWorkspaceRedis().set(publicProofKey(record.challengeCode), toPublicReceipt(record), { ex: ttl }),
  ]);
  return record;
}

export async function getPublicProofReceipt(challengeCode: string) {
  const value = await getWorkspaceRedis().get<unknown>(publicProofKey(challengeCode));
  return normalizePublicReceipt(value);
}

export async function getSocialVerification(accountId: string, platform: SocialPlatform) {
  const record = normalizeRecord(await getWorkspaceRedis().get<unknown>(verificationKey(accountId, platform)));
  if (!record) return null;
  if (!isExpired(record)) return record;
  const expired: SocialVerificationRecord = { ...record, status: "expired" };
  await saveRecord(expired);
  await getWorkspaceRedis().del(challengeIndexKey(record.challengeCode)).catch(() => 0);
  return expired;
}

export async function listSocialVerifications(accountId: string) {
  const records = await Promise.all(SOCIAL_PLATFORMS.map((platform) => getSocialVerification(accountId, platform)));
  return records.filter((record): record is SocialVerificationRecord => Boolean(record));
}

export async function issueSocialChallenge(accountId: string, platform: SocialPlatform, handle: string, shareTheme: PublicProofTheme) {
  const config = getSocialPlatformConfig(platform);
  if (!config.verifierEnabled) return { ok: false as const, reason: "verifier_unavailable" as const };
  const socialHandle = normalizeSocialHandle(handle);
  if (!isValidSocialHandle(platform, socialHandle)) return { ok: false as const, reason: "invalid_handle" as const };
  if (!isPublicProofTheme(shareTheme)) return { ok: false as const, reason: "invalid_theme" as const };

  const redis = getWorkspaceRedis();
  const claimedBy = await redis.get<string>(verifiedHandleKey(platform, socialHandle));
  if (claimedBy && claimedBy !== accountId) return { ok: false as const, reason: "handle_already_verified" as const };

  const existing = await getSocialVerification(accountId, platform);
  if (existing?.status === "verified" && existing.socialHandle === socialHandle) {
    return { ok: true as const, record: existing, alreadyVerified: true as const };
  }
  if (existing?.status === "verified" && existing.socialHandle !== socialHandle) {
    return { ok: false as const, reason: "revoke_existing_first" as const };
  }
  if (existing) await redis.del(challengeIndexKey(existing.challengeCode)).catch(() => 0);

  const now = new Date();
  const challengeCode = generateChallengeCode();
  const record: SocialVerificationRecord = {
    accountId,
    platform,
    method: "public-post",
    socialHandle,
    challengeCode,
    shareTheme,
    status: "challenge-issued",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString(),
    verifiedAt: null,
    revokedAt: null,
    externalAccountId: null,
    postUrl: null,
    postId: null,
    schemaVersion: 2,
  };
  await Promise.all([
    saveRecord(record),
    redis.set<ChallengeLocator>(challengeIndexKey(challengeCode), { accountId, platform }, { ex: CHALLENGE_TTL_SECONDS }),
  ]);
  return { ok: true as const, record, alreadyVerified: false as const };
}

export function extractXPostId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    return url.pathname.match(/\/status\/(\d+)/)?.[1] || null;
  } catch {
    return null;
  }
}

async function lookupXPost(postId: string) {
  const bearer = process.env.GWAPSCORE_X_BEARER_TOKEN?.trim();
  if (!bearer) return null;
  const url = new URL(`https://api.x.com/2/tweets/${postId}`);
  url.searchParams.set("tweet.fields", "author_id");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  return (await response.json()) as XPostLookup;
}

export async function submitPublicProofPost(accountId: string, platform: SocialPlatform, postUrl: string) {
  if (platform !== "x") return { ok: false as const, reason: "unsupported_method" as const };
  const record = await getSocialVerification(accountId, platform);
  if (!record) return { ok: false as const, reason: "challenge_not_found" as const };
  if (record.status === "verified") return { ok: true as const, record, alreadyVerified: true as const };
  if (record.status === "expired" || isExpired(record)) return { ok: false as const, reason: "challenge_expired" as const };

  const postId = extractXPostId(postUrl);
  if (!postId) return { ok: false as const, reason: "invalid_post_url" as const };
  const awaiting: SocialVerificationRecord = { ...record, status: "awaiting-post", postUrl: postUrl.trim(), postId };
  await saveRecord(awaiting);

  const lookup = await lookupXPost(postId);
  const post = lookup?.data;
  const authorId = post?.author_id?.trim() || "";
  const author = lookup?.includes?.users?.find((user) => user.id === authorId);
  const authorHandle = normalizeSocialHandle(author?.username || "");
  const text = post?.text || "";

  if (!post || !authorId || !authorHandle) return { ok: false as const, reason: "post_unavailable" as const, record: awaiting };
  if (!text.toUpperCase().includes(record.challengeCode.toUpperCase())) return { ok: false as const, reason: "challenge_missing" as const, record: awaiting };
  if (authorHandle !== record.socialHandle) return { ok: false as const, reason: "handle_mismatch" as const, record: awaiting };

  const redis = getWorkspaceRedis();
  const handleKey = verifiedHandleKey(platform, authorHandle);
  const accountKey = verifiedExternalAccountKey(platform, authorId);
  const [claimedByHandle, claimedByAccount] = await Promise.all([redis.get<string>(handleKey), redis.get<string>(accountKey)]);
  if ((claimedByHandle && claimedByHandle !== accountId) || (claimedByAccount && claimedByAccount !== accountId)) {
    return { ok: false as const, reason: "account_already_verified" as const, record: awaiting };
  }

  const verified: SocialVerificationRecord = { ...awaiting, status: "verified", verifiedAt: new Date().toISOString(), revokedAt: null, externalAccountId: authorId };
  await Promise.all([
    saveRecord(verified),
    redis.set(handleKey, accountId, { ex: VERIFIED_TTL_SECONDS }),
    redis.set(accountKey, accountId, { ex: VERIFIED_TTL_SECONDS }),
    redis.del(challengeIndexKey(record.challengeCode)),
  ]);
  await syncSnapshotSubject(verified);
  return { ok: true as const, record: verified, alreadyVerified: false as const };
}

export async function verifySocialChallenge(input: { challengeCode: string; platform: SocialPlatform; socialHandle: string; externalAccountId: string }) {
  const redis = getWorkspaceRedis();
  const code = input.challengeCode.trim().toUpperCase();
  const locator = await redis.get<ChallengeLocator>(challengeIndexKey(code));
  if (!locator || locator.platform !== input.platform) return { ok: false as const, reason: "challenge_not_found" as const };
  const record = await getSocialVerification(locator.accountId, locator.platform);
  if (!record || record.challengeCode !== code) return { ok: false as const, reason: "challenge_not_found" as const };
  if (record.status === "expired" || isExpired(record)) return { ok: false as const, reason: "challenge_expired" as const };

  const socialHandle = normalizeSocialHandle(input.socialHandle);
  if (socialHandle !== record.socialHandle) return { ok: false as const, reason: "handle_mismatch" as const };
  const externalAccountId = input.externalAccountId.trim().slice(0, 128);
  if (!externalAccountId) return { ok: false as const, reason: "external_account_required" as const };

  const handleKey = verifiedHandleKey(record.platform, socialHandle);
  const accountKey = verifiedExternalAccountKey(record.platform, externalAccountId);
  const [claimedByHandle, claimedByAccount] = await Promise.all([redis.get<string>(handleKey), redis.get<string>(accountKey)]);
  if ((claimedByHandle && claimedByHandle !== record.accountId) || (claimedByAccount && claimedByAccount !== record.accountId)) {
    return { ok: false as const, reason: "handle_already_verified" as const };
  }

  const verified: SocialVerificationRecord = { ...record, status: "verified", verifiedAt: new Date().toISOString(), revokedAt: null, externalAccountId };
  await Promise.all([
    saveRecord(verified),
    redis.set(handleKey, record.accountId, { ex: VERIFIED_TTL_SECONDS }),
    redis.set(accountKey, record.accountId, { ex: VERIFIED_TTL_SECONDS }),
    redis.del(challengeIndexKey(record.challengeCode)),
  ]);
  await syncSnapshotSubject(verified);
  return { ok: true as const, record: verified };
}

export async function revokeSocialVerification(accountId: string, platform: SocialPlatform) {
  const record = await getSocialVerification(accountId, platform);
  if (!record) return null;
  const revoked: SocialVerificationRecord = { ...record, status: "revoked", revokedAt: new Date().toISOString() };
  const redis = getWorkspaceRedis();
  const operations: Promise<unknown>[] = [
    saveRecord(revoked),
    redis.del(challengeIndexKey(record.challengeCode)).catch(() => 0),
    redis.deleteIfValue(verifiedHandleKey(platform, record.socialHandle), accountId).catch(() => false),
  ];
  if (record.externalAccountId) {
    operations.push(redis.deleteIfValue(verifiedExternalAccountKey(platform, record.externalAccountId), accountId).catch(() => false));
  }
  await Promise.all(operations);
  await syncSnapshotSubject(revoked);
  return revoked;
}
