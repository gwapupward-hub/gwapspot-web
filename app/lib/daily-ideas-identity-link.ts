import "server-only";

import { randomBytes } from "node:crypto";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import type { TelegramAccountRecord } from "./daily-ideas-telegram-account";

const LINK_TTL_SECONDS = 15 * 60;
const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,96}$/;

export type DailyIdeasIdentityLink = {
  telegramUserId: string;
  gwapUserId: string;
  gnsIdentity: string | null;
  linkedAt: string;
  schemaVersion: 1;
};

type LinkTokenRecord = {
  telegramUserId: string;
  createdAt: string;
  expiresAt: string;
};

function telegramAccountKey(telegramUserId: string) {
  return getPrivateStorageKey("daily-ideas-telegram-account", telegramUserId);
}

function telegramLinkKey(telegramUserId: string) {
  return getPrivateStorageKey("daily-ideas-account-link-telegram", telegramUserId);
}

function gwapLinkKey(gwapUserId: string) {
  return getPrivateStorageKey("daily-ideas-account-link-gwap", gwapUserId);
}

function linkTokenKey(token: string) {
  return getPrivateStorageKey("daily-ideas-account-link-token", token);
}

function validTelegramUserId(value: string) {
  return /^[1-9]\d{0,19}$/.test(value);
}

function validGwapUserId(value: string) {
  return value.length >= 3 && value.length <= 160 && !/[\s\x00-\x1f]/.test(value);
}

export function gwapDailyIdeasSubject(gwapUserId: string) {
  return `gwap:${gwapUserId}`;
}

export function telegramDailyIdeasSubject(telegramUserId: string) {
  return `telegram:${telegramUserId}`;
}

export async function getDailyIdeasIdentityLinkForTelegram(telegramUserId: string) {
  if (!validTelegramUserId(telegramUserId)) return null;
  const value = await getWorkspaceRedis().get<DailyIdeasIdentityLink>(telegramLinkKey(telegramUserId));
  return value?.telegramUserId === telegramUserId && validGwapUserId(value.gwapUserId) ? value : null;
}

export async function getDailyIdeasIdentityLinkForGwap(gwapUserId: string) {
  if (!validGwapUserId(gwapUserId)) return null;
  const value = await getWorkspaceRedis().get<DailyIdeasIdentityLink>(gwapLinkKey(gwapUserId));
  return value?.gwapUserId === gwapUserId && validTelegramUserId(value.telegramUserId) ? value : null;
}

export async function getDailyIdeasSubjectForTelegram(telegramUserId: string) {
  const link = await getDailyIdeasIdentityLinkForTelegram(telegramUserId);
  return link ? gwapDailyIdeasSubject(link.gwapUserId) : telegramDailyIdeasSubject(telegramUserId);
}

export async function createDailyIdeasAccountLinkToken(telegramUserId: string) {
  if (!validTelegramUserId(telegramUserId)) return null;
  const redis = getWorkspaceRedis();
  const account = await redis.get<TelegramAccountRecord>(telegramAccountKey(telegramUserId));
  if (!account?.id || account.telegramUserId !== telegramUserId) return null;

  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + LINK_TTL_SECONDS * 1000);
  const record: LinkTokenRecord = {
    telegramUserId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  await redis.set(linkTokenKey(token), record, { ex: LINK_TTL_SECONDS });
  return { token, expiresAt: record.expiresAt };
}

export async function inspectDailyIdeasAccountLinkToken(token: unknown) {
  if (typeof token !== "string" || !LINK_TOKEN_PATTERN.test(token)) return null;
  const redis = getWorkspaceRedis();
  const record = await redis.get<LinkTokenRecord>(linkTokenKey(token));
  if (!record || !validTelegramUserId(record.telegramUserId) || Date.parse(record.expiresAt) <= Date.now()) {
    if (record) await redis.del(linkTokenKey(token)).catch(() => 0);
    return null;
  }
  return {
    telegramUserId: record.telegramUserId,
    expiresAt: record.expiresAt,
  };
}

function mergeArrayBy<T>(left: T[], right: T[], keyFor: (value: T) => string, limit: number) {
  const merged = new Map<string, T>();
  for (const item of [...left, ...right]) {
    const key = keyFor(item);
    if (key) merged.set(key, item);
  }
  return [...merged.values()].slice(-limit);
}

async function migrateSubjectData(sourceSubject: string, targetSubject: string) {
  if (sourceSubject === targetSubject) return;
  const redis = getWorkspaceRedis();

  const simpleScopes = ["daily-ideas-preferences", "daily-ideas-engagement"] as const;
  for (const scope of simpleScopes) {
    const sourceKey = getPrivateStorageKey(scope, sourceSubject);
    const targetKey = getPrivateStorageKey(scope, targetSubject);
    const [source, target] = await Promise.all([
      redis.get<unknown>(sourceKey),
      redis.get<unknown>(targetKey),
    ]);
    if (source !== null && target === null) await redis.set(targetKey, source);
  }

  const sourceSaves = await redis.get<Array<{ idea?: { id?: string }; savedAt?: string }>>(
    getPrivateStorageKey("daily-ideas-saves", sourceSubject),
  );
  const targetSaves = await redis.get<Array<{ idea?: { id?: string }; savedAt?: string }>>(
    getPrivateStorageKey("daily-ideas-saves", targetSubject),
  );
  if (Array.isArray(sourceSaves) || Array.isArray(targetSaves)) {
    const merged = mergeArrayBy(
      Array.isArray(sourceSaves) ? sourceSaves : [],
      Array.isArray(targetSaves) ? targetSaves : [],
      (entry) => entry?.idea?.id || "",
      200,
    ).sort((a, b) => Date.parse(b.savedAt || "") - Date.parse(a.savedAt || ""));
    await redis.set(getPrivateStorageKey("daily-ideas-saves", targetSubject), merged);
  }

  const sourceProjects = await redis.get<Array<{ id?: string; updatedAt?: string }>>(
    getPrivateStorageKey("daily-ideas-projects", sourceSubject),
  );
  const targetProjects = await redis.get<Array<{ id?: string; updatedAt?: string }>>(
    getPrivateStorageKey("daily-ideas-projects", targetSubject),
  );
  if (Array.isArray(sourceProjects) || Array.isArray(targetProjects)) {
    const combined = [...(Array.isArray(sourceProjects) ? sourceProjects : []), ...(Array.isArray(targetProjects) ? targetProjects : [])]
      .sort((a, b) => Date.parse(a.updatedAt || "") - Date.parse(b.updatedAt || ""));
    const merged = mergeArrayBy(combined, [], (entry) => entry?.id || "", 50)
      .sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
    await redis.set(getPrivateStorageKey("daily-ideas-projects", targetSubject), merged);
  }

  const sourceHistory = await redis.get<Array<{ ideaId?: string; deliveredAt?: string; mode?: string }>>(
    getPrivateStorageKey("daily-ideas-delivery-history", sourceSubject),
  );
  const targetHistory = await redis.get<Array<{ ideaId?: string; deliveredAt?: string; mode?: string }>>(
    getPrivateStorageKey("daily-ideas-delivery-history", targetSubject),
  );
  if (Array.isArray(sourceHistory) || Array.isArray(targetHistory)) {
    const merged = mergeArrayBy(
      Array.isArray(sourceHistory) ? sourceHistory : [],
      Array.isArray(targetHistory) ? targetHistory : [],
      (entry) => `${entry?.ideaId || ""}:${entry?.deliveredAt || ""}:${entry?.mode || ""}`,
      500,
    ).sort((a, b) => Date.parse(b.deliveredAt || "") - Date.parse(a.deliveredAt || ""));
    await redis.set(getPrivateStorageKey("daily-ideas-delivery-history", targetSubject), merged);
  }
}

export async function migrateDailyIdeasGwapIdentity(
  legacyGwapUserId: string,
  canonicalGwapUserId: string,
) {
  if (!validGwapUserId(legacyGwapUserId) || !validGwapUserId(canonicalGwapUserId)) {
    return { ok: false as const, reason: "invalid" as const };
  }
  if (legacyGwapUserId === canonicalGwapUserId) return { ok: true as const, migrated: false };

  const redis = getWorkspaceRedis();
  const [legacyLink, canonicalLink] = await Promise.all([
    getDailyIdeasIdentityLinkForGwap(legacyGwapUserId),
    getDailyIdeasIdentityLinkForGwap(canonicalGwapUserId),
  ]);
  if (legacyLink && canonicalLink && legacyLink.telegramUserId !== canonicalLink.telegramUserId) {
    return { ok: false as const, reason: "identity_conflict" as const };
  }

  await migrateSubjectData(
    gwapDailyIdeasSubject(legacyGwapUserId),
    gwapDailyIdeasSubject(canonicalGwapUserId),
  );

  const link = canonicalLink || legacyLink;
  if (!link) return { ok: true as const, migrated: true };

  const telegramLink = await getDailyIdeasIdentityLinkForTelegram(link.telegramUserId);
  if (
    telegramLink &&
    telegramLink.gwapUserId !== legacyGwapUserId &&
    telegramLink.gwapUserId !== canonicalGwapUserId
  ) {
    return { ok: false as const, reason: "identity_conflict" as const };
  }

  const account = await redis.get<TelegramAccountRecord>(telegramAccountKey(link.telegramUserId));
  const canonical: DailyIdeasIdentityLink = {
    ...link,
    gwapUserId: canonicalGwapUserId,
  };
  await Promise.all([
    redis.set(telegramLinkKey(canonical.telegramUserId), canonical),
    redis.set(gwapLinkKey(canonical.gwapUserId), canonical),
    ...(account?.id
      ? [
          redis.set(telegramAccountKey(canonical.telegramUserId), {
            ...account,
            gwapUserId: canonical.gwapUserId,
            gnsIdentity: canonical.gnsIdentity,
            updatedAt: new Date().toISOString(),
          } satisfies TelegramAccountRecord),
        ]
      : []),
  ]);
  await redis.del(gwapLinkKey(legacyGwapUserId)).catch(() => 0);
  return { ok: true as const, migrated: true, link: canonical };
}

export async function consumeDailyIdeasAccountLinkToken(
  token: unknown,
  input: { gwapUserId: string; gnsIdentity?: string | null },
) {
  if (typeof token !== "string" || !LINK_TOKEN_PATTERN.test(token) || !validGwapUserId(input.gwapUserId)) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const redis = getWorkspaceRedis();
  const tokenKey = linkTokenKey(token);
  const record = await redis.get<LinkTokenRecord>(tokenKey);
  if (!record || !validTelegramUserId(record.telegramUserId) || Date.parse(record.expiresAt) <= Date.now()) {
    if (record) await redis.del(tokenKey).catch(() => 0);
    return { ok: false as const, reason: "expired" as const };
  }

  const [telegramLink, gwapLink, account] = await Promise.all([
    getDailyIdeasIdentityLinkForTelegram(record.telegramUserId),
    getDailyIdeasIdentityLinkForGwap(input.gwapUserId),
    redis.get<TelegramAccountRecord>(telegramAccountKey(record.telegramUserId)),
  ]);
  if (!account?.id) return { ok: false as const, reason: "account_missing" as const };
  if (telegramLink && telegramLink.gwapUserId !== input.gwapUserId) {
    return { ok: false as const, reason: "telegram_already_linked" as const };
  }
  if (gwapLink && gwapLink.telegramUserId !== record.telegramUserId) {
    return { ok: false as const, reason: "gwap_already_linked" as const };
  }

  const sourceSubject = telegramDailyIdeasSubject(record.telegramUserId);
  const targetSubject = gwapDailyIdeasSubject(input.gwapUserId);
  await migrateSubjectData(sourceSubject, targetSubject);

  const link: DailyIdeasIdentityLink = {
    telegramUserId: record.telegramUserId,
    gwapUserId: input.gwapUserId,
    gnsIdentity: input.gnsIdentity?.trim().slice(0, 128) || null,
    linkedAt: telegramLink?.linkedAt || gwapLink?.linkedAt || new Date().toISOString(),
    schemaVersion: 1,
  };

  await Promise.all([
    redis.set(telegramLinkKey(link.telegramUserId), link),
    redis.set(gwapLinkKey(link.gwapUserId), link),
    redis.set(telegramAccountKey(link.telegramUserId), {
      ...account,
      gwapUserId: link.gwapUserId,
      gnsIdentity: link.gnsIdentity,
      updatedAt: new Date().toISOString(),
    } satisfies TelegramAccountRecord),
  ]);
  await redis.del(tokenKey);
  return { ok: true as const, link };
}
