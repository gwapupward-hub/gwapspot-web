import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import {
  getTelegramAccountId,
  type TelegramAccountInput,
} from "./daily-ideas-telegram-account-core";

export type TelegramAccountRecord = TelegramAccountInput & {
  id: string;
  gwapUserId: string | null;
  gnsIdentity: string | null;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  schemaVersion: 1;
};

export async function upsertTelegramAccount(input: TelegramAccountInput) {
  const redis = getWorkspaceRedis();
  const key = getPrivateStorageKey("daily-ideas-telegram-account", input.telegramUserId);
  const existing = await redis.get<Partial<TelegramAccountRecord>>(key);
  const now = new Date().toISOString();

  const record: TelegramAccountRecord = {
    ...input,
    id: getTelegramAccountId(input.telegramUserId),
    gwapUserId: typeof existing?.gwapUserId === "string" ? existing.gwapUserId : null,
    gnsIdentity: typeof existing?.gnsIdentity === "string" ? existing.gnsIdentity : null,
    onboardingComplete: existing?.onboardingComplete === true,
    createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : now,
    updatedAt: now,
    lastActiveAt: now,
    schemaVersion: 1,
  };

  await redis.set(key, record);
  return { created: !existing?.id, record };
}
