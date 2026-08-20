import "server-only";

import type { TelegramAccountRecord } from "./daily-ideas-telegram-account";
import {
  getDailyIdeasIdentityLinkForGwap,
  gwapDailyIdeasSubject,
} from "./daily-ideas-identity-link";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

export async function deleteDailyIdeasDataForGwapAccount(gwapUserId: string) {
  const redis = getWorkspaceRedis();
  const subject = gwapDailyIdeasSubject(gwapUserId);
  const link = await getDailyIdeasIdentityLinkForGwap(gwapUserId);

  const keys = [
    getPrivateStorageKey("daily-ideas-preferences", subject),
    getPrivateStorageKey("daily-ideas-engagement", subject),
    getPrivateStorageKey("daily-ideas-saves", subject),
    getPrivateStorageKey("daily-ideas-projects", subject),
    getPrivateStorageKey("daily-ideas-delivery-history", subject),
    getPrivateStorageKey("daily-ideas-account-link-gwap", gwapUserId),
  ];

  if (link) {
    keys.push(getPrivateStorageKey("daily-ideas-account-link-telegram", link.telegramUserId));
    const telegramAccountKey = getPrivateStorageKey(
      "daily-ideas-telegram-account",
      link.telegramUserId,
    );
    const telegramAccount = await redis.get<TelegramAccountRecord>(telegramAccountKey);
    if (telegramAccount?.id) {
      await redis.set(telegramAccountKey, {
        ...telegramAccount,
        gwapUserId: null,
        gnsIdentity: null,
        updatedAt: new Date().toISOString(),
      } satisfies TelegramAccountRecord);
    }
  }

  await Promise.all(keys.map((key) => redis.del(key).catch(() => 0)));
}
