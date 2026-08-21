import "server-only";

import { randomBytes } from "node:crypto";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

export const SOCIAL_PLATFORMS = ["x"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialVerificationStatus =
  | "challenge-issued"
  | "awaiting-dm"
  | "verified"
  | "revoked"
  | "expired";

export type SocialVerificationRecord = {
  accountId: string;
  platform: SocialPlatform;
  socialHandle: string;
  challengeCode: string;
  status: SocialVerificationStatus;
  issuedAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  revokedAt: string | null;
  externalAccountId: string | null;
  schemaVersion: 1;
};

export type SocialPlatformConfig = {
  platform: SocialPlatform;
  label: string;
  officialHandle: string;
  verifierEnabled: boolean;
  challengeTtlMinutes: number;
};

type ChallengeLocator = {
  accountId: string;
  platform: SocialPlatform;
};

const CHALLENGE_TTL_SECONDS = 20 * 60;
const VERIFIED_TTL_SECONDS = 365 * 24 * 60 * 60;
const CHALLENGE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function verificationKey(accountId: string, platform: SocialPlatform) {
  return getPrivateStorageKey("social-proof-control", `${accountId}:${platform}`);
}

function challengeIndexKey(code: string) {
  return getPrivateStorageKey("social-proof-control-code", code);
}

function verifiedHandleKey(platform: SocialPlatform, handle: string) {
  return getPrivateStorageKey(
    "social-proof-control-handle",
    `${platform}:${normalizeSocialHandle(handle)}`,
  );
}

function verifiedExternalAccountKey(platform: SocialPlatform, externalAccountId: string) {
  return getPrivateStorageKey(
    "social-proof-control-external-account",
    `${platform}:${externalAccountId.trim()}`,
  );
}

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return (
    typeof value === "string" &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(value)
  );
}

export function normalizeSocialHandle(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidSocialHandle(platform: SocialPlatform, value: string) {
  const normalized = normalizeSocialHandle(value);
  if (platform === "x") return /^[a-z0-9_]{1,15}$/.test(normalized);
  return false;
}

function envEnabled(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(value?.trim() || "");
}

function getVerifierSecret() {
  return process.env.GWAPSCORE_SOCIAL_VERIFICATION_WEBHOOK_SECRET?.trim() || "";
}

export function getSocialPlatformConfig(
  platform: SocialPlatform,
): SocialPlatformConfig {
  if (platform === "x") {
    return {
      platform,
      label: "X",
      officialHandle: normalizeSocialHandle(
        process.env.GWAPSCORE_X_OFFICIAL_HANDLE || "_GwapSpot",
      ),
      verifierEnabled:
        envEnabled(process.env.GWAPSCORE_SOCIAL_VERIFIER_ENABLED) &&
        Boolean(getVerifierSecret()),
      challengeTtlMinutes: CHALLENGE_TTL_SECONDS / 60,
    };
  }
  return {
    platform,
    label: platform,
    officialHandle: "",
    verifierEnabled: false,
    challengeTtlMinutes: CHALLENGE_TTL_SECONDS / 60,
  };
}

export function getSocialVerifierSecret() {
  return getVerifierSecret();
}

export function isSocialVerifierEnabled(platform: SocialPlatform) {
  return getSocialPlatformConfig(platform).verifierEnabled;
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
    typeof record.socialHandle !== "string" ||
    typeof record.challengeCode !== "string" ||
    ![
      "challenge-issued",
      "awaiting-dm",
      "verified",
      "revoked",
      "expired",
    ].includes(record.status || "") ||
    typeof record.issuedAt !== "string" ||
    typeof record.expiresAt !== "string" ||
    record.schemaVersion !== 1
  ) {
    return null;
  }
  return record as SocialVerificationRecord;
}

function isExpired(record: SocialVerificationRecord) {
  return (
    record.status !== "verified" &&
    record.status !== "revoked" &&
    Date.now() >= Date.parse(record.expiresAt)
  );
}

async function saveRecord(record: SocialVerificationRecord) {
  const ttl =
    record.status === "verified" ? VERIFIED_TTL_SECONDS : CHALLENGE_TTL_SECONDS + 60;
  await getWorkspaceRedis().set(
    verificationKey(record.accountId, record.platform),
    record,
    { ex: ttl },
  );
  return record;
}

export async function getSocialVerification(
  accountId: string,
  platform: SocialPlatform,
) {
  const record = normalizeRecord(
    await getWorkspaceRedis().get<unknown>(verificationKey(accountId, platform)),
  );
  if (!record) return null;
  if (!isExpired(record)) return record;

  const expired: SocialVerificationRecord = {
    ...record,
    status: "expired",
  };
  await saveRecord(expired);
  await getWorkspaceRedis()
    .del(challengeIndexKey(record.challengeCode))
    .catch(() => 0);
  return expired;
}

export async function listSocialVerifications(accountId: string) {
  const records = await Promise.all(
    SOCIAL_PLATFORMS.map((platform) =>
      getSocialVerification(accountId, platform),
    ),
  );
  return records.filter(
    (record): record is SocialVerificationRecord => Boolean(record),
  );
}

export async function issueSocialChallenge(
  accountId: string,
  platform: SocialPlatform,
  handle: string,
) {
  const config = getSocialPlatformConfig(platform);
  if (!config.verifierEnabled) {
    return { ok: false as const, reason: "verifier_unavailable" as const };
  }

  const socialHandle = normalizeSocialHandle(handle);
  if (!isValidSocialHandle(platform, socialHandle)) {
    return { ok: false as const, reason: "invalid_handle" as const };
  }

  const redis = getWorkspaceRedis();
  const claimedBy = await redis.get<string>(
    verifiedHandleKey(platform, socialHandle),
  );
  if (claimedBy && claimedBy !== accountId) {
    return { ok: false as const, reason: "handle_already_verified" as const };
  }

  const existing = await getSocialVerification(accountId, platform);
  if (
    existing?.status === "verified" &&
    existing.socialHandle === socialHandle
  ) {
    return {
      ok: true as const,
      record: existing,
      alreadyVerified: true as const,
    };
  }
  if (
    existing?.status === "verified" &&
    existing.socialHandle !== socialHandle
  ) {
    return { ok: false as const, reason: "revoke_existing_first" as const };
  }

  if (existing) {
    await redis.del(challengeIndexKey(existing.challengeCode)).catch(() => 0);
  }

  const now = new Date();
  const challengeCode = generateChallengeCode();
  const record: SocialVerificationRecord = {
    accountId,
    platform,
    socialHandle,
    challengeCode,
    status: "challenge-issued",
    issuedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + CHALLENGE_TTL_SECONDS * 1000,
    ).toISOString(),
    verifiedAt: null,
    revokedAt: null,
    externalAccountId: null,
    schemaVersion: 1,
  };

  await Promise.all([
    saveRecord(record),
    redis.set<ChallengeLocator>(
      challengeIndexKey(challengeCode),
      { accountId, platform },
      { ex: CHALLENGE_TTL_SECONDS },
    ),
  ]);
  return { ok: true as const, record, alreadyVerified: false as const };
}

export async function markSocialChallengeSent(
  accountId: string,
  platform: SocialPlatform,
) {
  const record = await getSocialVerification(accountId, platform);
  if (
    !record ||
    record.status === "expired" ||
    record.status === "revoked"
  ) {
    return null;
  }
  if (record.status === "verified") return record;
  return saveRecord({ ...record, status: "awaiting-dm" });
}

export async function verifySocialChallenge(input: {
  challengeCode: string;
  platform: SocialPlatform;
  socialHandle: string;
  externalAccountId: string;
}) {
  if (!isSocialVerifierEnabled(input.platform)) {
    return { ok: false as const, reason: "verifier_unavailable" as const };
  }

  const externalAccountId = input.externalAccountId.trim();
  if (!externalAccountId || externalAccountId.length > 128) {
    return { ok: false as const, reason: "external_account_required" as const };
  }

  const redis = getWorkspaceRedis();
  const challengeCode = input.challengeCode.trim().toUpperCase();
  const locator = await redis.get<ChallengeLocator>(
    challengeIndexKey(challengeCode),
  );
  if (!locator || locator.platform !== input.platform) {
    return { ok: false as const, reason: "challenge_not_found" as const };
  }

  const record = await getSocialVerification(locator.accountId, locator.platform);
  if (!record || record.challengeCode !== challengeCode) {
    return { ok: false as const, reason: "challenge_not_found" as const };
  }
  if (record.status === "expired" || isExpired(record)) {
    return { ok: false as const, reason: "challenge_expired" as const };
  }

  const socialHandle = normalizeSocialHandle(input.socialHandle);
  if (socialHandle !== record.socialHandle) {
    return { ok: false as const, reason: "handle_mismatch" as const };
  }

  const handleKey = verifiedHandleKey(record.platform, socialHandle);
  const externalKey = verifiedExternalAccountKey(
    record.platform,
    externalAccountId,
  );
  const [handleOwner, externalOwner] = await Promise.all([
    redis.get<string>(handleKey),
    redis.get<string>(externalKey),
  ]);
  if (
    (handleOwner && handleOwner !== record.accountId) ||
    (externalOwner && externalOwner !== record.accountId)
  ) {
    return { ok: false as const, reason: "social_account_already_verified" as const };
  }

  const handleClaimed =
    handleOwner === record.accountId ||
    (await redis.setIfAbsent(handleKey, record.accountId, VERIFIED_TTL_SECONDS));
  if (!handleClaimed) {
    return { ok: false as const, reason: "social_account_already_verified" as const };
  }

  const externalClaimed =
    externalOwner === record.accountId ||
    (await redis.setIfAbsent(
      externalKey,
      record.accountId,
      VERIFIED_TTL_SECONDS,
    ));
  if (!externalClaimed) {
    if (!handleOwner) {
      await redis.deleteIfValue(handleKey, record.accountId).catch(() => false);
    }
    return { ok: false as const, reason: "social_account_already_verified" as const };
  }

  const verified: SocialVerificationRecord = {
    ...record,
    status: "verified",
    verifiedAt: new Date().toISOString(),
    revokedAt: null,
    externalAccountId,
  };

  try {
    await saveRecord(verified);
  } catch (error) {
    if (!handleOwner) {
      await redis.deleteIfValue(handleKey, record.accountId).catch(() => false);
    }
    if (!externalOwner) {
      await redis.deleteIfValue(externalKey, record.accountId).catch(() => false);
    }
    throw error;
  }

  await redis.del(challengeIndexKey(record.challengeCode));
  return { ok: true as const, record: verified };
}

export async function revokeSocialVerification(
  accountId: string,
  platform: SocialPlatform,
) {
  const record = await getSocialVerification(accountId, platform);
  if (!record) return null;
  const revoked: SocialVerificationRecord = {
    ...record,
    status: "revoked",
    revokedAt: new Date().toISOString(),
  };
  const redis = getWorkspaceRedis();
  const deletes: Promise<unknown>[] = [
    saveRecord(revoked),
    redis.del(challengeIndexKey(record.challengeCode)).catch(() => 0),
    redis
      .deleteIfValue(
        verifiedHandleKey(platform, record.socialHandle),
        accountId,
      )
      .catch(() => false),
  ];
  if (record.externalAccountId) {
    deletes.push(
      redis
        .deleteIfValue(
          verifiedExternalAccountKey(platform, record.externalAccountId),
          accountId,
        )
        .catch(() => false),
    );
  }
  await Promise.all(deletes);
  return revoked;
}
