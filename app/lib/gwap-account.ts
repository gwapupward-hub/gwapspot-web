import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import type { WalletIdentity } from "./privy-server";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import {
  isGwapAccountId,
  isTelegramUserId,
  mergeGwapAccountIdentity,
  normalizeGwapAccountRecord,
  type GwapAccountRecord,
} from "./gwap-account-core";

const ACCOUNT_LOCK_TTL_SECONDS = 15;
const ACCOUNT_LOCK_ATTEMPTS = 12;

function accountKey(accountId: string) {
  return getPrivateStorageKey("gwap-account", accountId);
}
function privyMapKey(privyUserId: string) {
  return getPrivateStorageKey("gwap-account-privy", privyUserId);
}
function telegramMapKey(telegramUserId: string) {
  return getPrivateStorageKey("gwap-account-telegram", telegramUserId);
}
function walletMapKey(wallet: string) {
  return getPrivateStorageKey("gwap-account-wallet", wallet);
}
function lockKey(scope: string, subject: string) {
  return getPrivateStorageKey(`gwap-account-lock-${scope}`, subject);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withLock<T>(scope: string, subject: string, operation: () => Promise<T>): Promise<T> {
  const redis = getWorkspaceRedis();
  const key = lockKey(scope, subject);
  const token = randomUUID();

  for (let attempt = 0; attempt < ACCOUNT_LOCK_ATTEMPTS; attempt += 1) {
    const acquired = await redis.setIfAbsent(key, token, ACCOUNT_LOCK_TTL_SECONDS);
    if (acquired) {
      try {
        return await operation();
      } finally {
        await redis.deleteIfValue(key, token).catch(() => false);
      }
    }
    await sleep(30 + attempt * 20);
  }

  throw new Error("GWAP account is busy. Retry the request.");
}

async function readAccount(accountId: string) {
  if (!isGwapAccountId(accountId)) return null;
  return normalizeGwapAccountRecord(
    await getWorkspaceRedis().get<unknown>(accountKey(accountId)),
  );
}

async function readMappedAccount(mapKey: string) {
  const accountId = await getWorkspaceRedis().get<string>(mapKey);
  return typeof accountId === "string" ? readAccount(accountId) : null;
}

async function persistMappings(account: GwapAccountRecord) {
  const redis = getWorkspaceRedis();
  await Promise.all([
    redis.set(accountKey(account.id), account),
    ...account.privyUserIds.map((userId) => redis.set(privyMapKey(userId), account.id)),
    ...account.wallets.map((wallet) => redis.set(walletMapKey(wallet.address), account.id)),
    ...(account.telegramUserId ? [redis.set(telegramMapKey(account.telegramUserId), account.id)] : []),
  ]);
}

function createAccountId() {
  return `gwap_${randomBytes(24).toString("base64url")}`;
}

function initialRecord(identity: WalletIdentity, primaryGnsIdentity?: string | null): GwapAccountRecord {
  const now = new Date().toISOString();
  const wallets = [
    {
      address: identity.verifiedWallet,
      kind: identity.walletProvider,
      linkedAt: now,
    },
    ...(identity.embeddedWallet && identity.embeddedWallet !== identity.verifiedWallet
      ? [{ address: identity.embeddedWallet, kind: "embedded" as const, linkedAt: now }]
      : []),
  ];

  return {
    id: createAccountId(),
    privyUserIds: [identity.userId],
    telegramUserId: null,
    wallets,
    primaryWallet: identity.verifiedWallet,
    primaryGnsIdentity: primaryGnsIdentity?.trim().slice(0, 128) || null,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

export async function getGwapAccountById(accountId: string) {
  return readAccount(accountId);
}

export async function getGwapAccountForTelegram(telegramUserId: string) {
  if (!isTelegramUserId(telegramUserId)) return null;
  return readMappedAccount(telegramMapKey(telegramUserId));
}

export async function getOrCreateGwapAccount(
  identity: WalletIdentity,
  options: { primaryGnsIdentity?: string | null } = {},
) {
  return withLock("privy", identity.userId, async () => {
    const redis = getWorkspaceRedis();
    let account = await readMappedAccount(privyMapKey(identity.userId));

    if (!account) {
      account = await readMappedAccount(walletMapKey(identity.verifiedWallet));
    }
    if (!account && identity.embeddedWallet) {
      account = await readMappedAccount(walletMapKey(identity.embeddedWallet));
    }

    if (!account) {
      account = initialRecord(identity, options.primaryGnsIdentity);
    } else {
      account = mergeGwapAccountIdentity(account, {
        privyUserId: identity.userId,
        verifiedWallet: identity.verifiedWallet,
        embeddedWallet: identity.embeddedWallet,
        primaryGnsIdentity: options.primaryGnsIdentity,
      });
    }

    await persistMappings(account);
    return account;
  });
}

export async function canLinkTelegramToGwapAccount(accountId: string, telegramUserId: string) {
  if (!isGwapAccountId(accountId) || !isTelegramUserId(telegramUserId)) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const [account, telegramAccount] = await Promise.all([
    readAccount(accountId),
    readMappedAccount(telegramMapKey(telegramUserId)),
  ]);
  if (!account) return { ok: false as const, reason: "account_missing" as const };
  if (account.telegramUserId && account.telegramUserId !== telegramUserId) {
    return { ok: false as const, reason: "gwap_already_linked" as const };
  }
  if (telegramAccount && telegramAccount.id !== accountId) {
    return { ok: false as const, reason: "telegram_already_linked" as const };
  }
  return { ok: true as const, account };
}

export async function linkTelegramToGwapAccount(
  accountId: string,
  telegramUserId: string,
  options: { primaryGnsIdentity?: string | null } = {},
) {
  return withLock("account", accountId, async () => {
    const availability = await canLinkTelegramToGwapAccount(accountId, telegramUserId);
    if (!availability.ok) return availability;
    const now = new Date().toISOString();
    const account: GwapAccountRecord = {
      ...availability.account,
      telegramUserId,
      primaryGnsIdentity:
        options.primaryGnsIdentity?.trim().slice(0, 128) || availability.account.primaryGnsIdentity,
      updatedAt: now,
    };
    await persistMappings(account);
    return { ok: true as const, account };
  });
}

export async function updateGwapAccountGnsIdentity(accountId: string, gnsIdentity: string | null) {
  return withLock("account", accountId, async () => {
    const account = await readAccount(accountId);
    if (!account) return null;
    const next = {
      ...account,
      primaryGnsIdentity: gnsIdentity?.trim().slice(0, 128) || null,
      updatedAt: new Date().toISOString(),
    } satisfies GwapAccountRecord;
    await persistMappings(next);
    return next;
  });
}

export async function deleteGwapAccount(accountId: string) {
  const account = await readAccount(accountId);
  if (!account) return;
  const redis = getWorkspaceRedis();
  await Promise.all([
    redis.del(accountKey(account.id)),
    ...account.privyUserIds.map((userId) => redis.del(privyMapKey(userId))),
    ...account.wallets.map((wallet) => redis.del(walletMapKey(wallet.address))),
    ...(account.telegramUserId ? [redis.del(telegramMapKey(account.telegramUserId))] : []),
  ]);
}
