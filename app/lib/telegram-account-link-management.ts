import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import type { TelegramAccountRecord } from "./daily-ideas-telegram-account";
import { getDailyIdeasIdentityLinkForGwap } from "./daily-ideas-identity-link";

function telegramAccountKey(telegramUserId: string) {
  return getPrivateStorageKey("daily-ideas-telegram-account", telegramUserId);
}

function telegramLinkKey(telegramUserId: string) {
  return getPrivateStorageKey("daily-ideas-account-link-telegram", telegramUserId);
}

function gwapLinkKey(gwapUserId: string) {
  return getPrivateStorageKey("daily-ideas-account-link-gwap", gwapUserId);
}

export async function getTelegramLinkManagementSnapshot(gwapUserId: string) {
  const link = await getDailyIdeasIdentityLinkForGwap(gwapUserId);
  if (!link) return null;
  const account = await getWorkspaceRedis().get<TelegramAccountRecord>(telegramAccountKey(link.telegramUserId));
  return {
    telegramUserId: link.telegramUserId,
    telegramUsername: account?.username || null,
    telegramFirstName: account?.firstName || null,
    telegramLastName: account?.lastName || null,
    gnsIdentity: link.gnsIdentity,
    linkedAt: link.linkedAt,
  };
}

export async function removeDailyIdeasTelegramIdentityLink(gwapUserId: string, telegramUserId: string) {
  const redis = getWorkspaceRedis();
  const link = await getDailyIdeasIdentityLinkForGwap(gwapUserId);
  if (!link || link.telegramUserId !== telegramUserId) {
    return { ok: false as const, reason: "link_missing" as const };
  }

  const accountKey = telegramAccountKey(telegramUserId);
  const account = await redis.get<TelegramAccountRecord>(accountKey);

  await Promise.all([
    redis.del(telegramLinkKey(telegramUserId)),
    redis.del(gwapLinkKey(gwapUserId)),
    ...(account?.id
      ? [
          redis.set(accountKey, {
            ...account,
            gwapUserId: null,
            gnsIdentity: null,
            updatedAt: new Date().toISOString(),
          } satisfies TelegramAccountRecord),
        ]
      : []),
  ]);

  return { ok: true as const };
}
