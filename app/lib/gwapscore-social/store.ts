import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "../redis";
import type {
  SocialAccount,
  VerificationChallenge,
  VerificationEvent,
} from "./types";

const ACTIVE_CHALLENGE_INDEX_TTL_SECONDS = 60 * 60;

function accountKey(accountId: string) {
  return getPrivateStorageKey("gwapscore-social-account", accountId);
}

function userAccountsKey(userId: string) {
  return getPrivateStorageKey("gwapscore-social-user-accounts", userId);
}

function platformIdentityKey(platform: string, platformUserId: string) {
  return getPrivateStorageKey(
    "gwapscore-social-platform-identity",
    `${platform}:${platformUserId}`,
  );
}

function challengeKey(challengeId: string) {
  return getPrivateStorageKey("gwapscore-social-challenge", challengeId);
}

function challengeHashKey(platform: string, hash: string) {
  return getPrivateStorageKey(
    "gwapscore-social-challenge-hash",
    `${platform}:${hash}`,
  );
}

function activeChallengeIndexKey() {
  return getPrivateStorageKey("gwapscore-social-active-challenges", "v1");
}

function eventKey(eventId: string) {
  return getPrivateStorageKey("gwapscore-social-verification-event", eventId);
}

function accountEventsKey(accountId: string) {
  return getPrivateStorageKey("gwapscore-social-account-events", accountId);
}

async function appendUnique(key: string, value: string, ttlSeconds?: number) {
  const redis = getWorkspaceRedis();
  const current = (await redis.get<string[]>(key)) ?? [];
  if (!current.includes(value)) {
    await redis.set(key, [...current, value], ttlSeconds ? { ex: ttlSeconds } : undefined);
  } else if (ttlSeconds) {
    await redis.expire(key, ttlSeconds);
  }
}

export async function listSocialAccountsForUser(userId: string) {
  const redis = getWorkspaceRedis();
  const ids = (await redis.get<string[]>(userAccountsKey(userId))) ?? [];
  const accounts = await Promise.all(ids.map((id) => redis.get<SocialAccount>(accountKey(id))));
  return accounts.filter((account): account is SocialAccount => Boolean(account));
}

export async function getSocialAccount(accountId: string) {
  return getWorkspaceRedis().get<SocialAccount>(accountKey(accountId));
}

export async function getOwnedSocialAccount(userId: string, accountId: string) {
  const account = await getSocialAccount(accountId);
  return account?.gwapUserId === userId ? account : null;
}

export async function saveSocialAccount(account: SocialAccount) {
  const redis = getWorkspaceRedis();
  await redis.set(accountKey(account.id), account);
  await appendUnique(userAccountsKey(account.gwapUserId), account.id);
  await redis.set(platformIdentityKey(account.platform, account.platformUserId), account.id);
}

export async function getAccountIdForPlatformIdentity(platform: string, platformUserId: string) {
  return getWorkspaceRedis().get<string>(platformIdentityKey(platform, platformUserId));
}

export async function saveChallenge(challenge: VerificationChallenge, ttlSeconds: number) {
  const redis = getWorkspaceRedis();
  await redis.set(challengeKey(challenge.id), challenge, { ex: ttlSeconds + 60 * 60 });
  await redis.set(challengeHashKey(challenge.platform, challenge.challengeHash), challenge.id, {
    ex: ttlSeconds,
  });
  await appendUnique(activeChallengeIndexKey(), challenge.id, ACTIVE_CHALLENGE_INDEX_TTL_SECONDS);
}

export async function getChallenge(challengeId: string) {
  return getWorkspaceRedis().get<VerificationChallenge>(challengeKey(challengeId));
}

export async function updateChallenge(challenge: VerificationChallenge, ttlSeconds = 60 * 60) {
  await getWorkspaceRedis().set(challengeKey(challenge.id), challenge, { ex: ttlSeconds });
}

export async function deleteChallengeHashIndex(challenge: VerificationChallenge) {
  await getWorkspaceRedis().del(challengeHashKey(challenge.platform, challenge.challengeHash));
}

export async function getActiveChallengeIds() {
  return (await getWorkspaceRedis().get<string[]>(activeChallengeIndexKey())) ?? [];
}

export async function replaceActiveChallengeIds(ids: string[]) {
  await getWorkspaceRedis().set(activeChallengeIndexKey(), ids, {
    ex: ACTIVE_CHALLENGE_INDEX_TTL_SECONDS,
  });
}

export async function appendVerificationEvent(event: VerificationEvent) {
  const redis = getWorkspaceRedis();
  await redis.set(eventKey(event.id), event);
  await appendUnique(accountEventsKey(event.socialAccountId), event.id);
}

export async function listVerificationEvents(accountId: string) {
  const redis = getWorkspaceRedis();
  const ids = (await redis.get<string[]>(accountEventsKey(accountId))) ?? [];
  const events = await Promise.all(ids.map((id) => redis.get<VerificationEvent>(eventKey(id))));
  return events.filter((event): event is VerificationEvent => Boolean(event));
}
