import "server-only";

import { randomUUID } from "node:crypto";
import {
  addMilliseconds,
  challengeHashesMatch,
  generateVerificationChallenge,
  hashVerificationChallenge,
  isChallengeExpired,
  isValidXUsername,
  normalizeXUsername,
  VERIFICATION_CHALLENGE_TTL_MS,
} from "./core";
import {
  appendVerificationEvent,
  deleteChallengeHashIndex,
  getAccountIdForPlatformIdentity,
  getActiveChallengeIds,
  getChallenge,
  getOwnedSocialAccount,
  getSocialAccount,
  listSocialAccountsForUser,
  replaceActiveChallengeIds,
  saveChallenge,
  saveSocialAccount,
  updateChallenge,
} from "./store";
import type {
  SocialAccount,
  SocialSummary,
  VerificationChallenge,
  VerificationEventType,
  VerificationState,
} from "./types";
import { XAdapter, XPlatformError } from "./x-adapter";

const adapter = new XAdapter();
const CHALLENGE_TTL_SECONDS = Math.ceil(VERIFICATION_CHALLENGE_TTL_MS / 1_000);

export class GwapScoreSocialError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "GwapScoreSocialError";
  }
}

function challengeSecret() {
  return process.env.GWAPSCORE_CHALLENGE_SECRET;
}

function emitTelemetry(event: string, data: Record<string, string | number | boolean | null>) {
  console.info("gwapscore_social", { event, ...data });
}

async function recordEvent(
  account: SocialAccount,
  type: VerificationEventType,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await appendVerificationEvent({
    id: randomUUID(),
    socialAccountId: account.id,
    gwapUserId: account.gwapUserId,
    platform: account.platform,
    type,
    timestamp: new Date().toISOString(),
    metadata,
  });
}

async function setAccountState(account: SocialAccount, state: VerificationState) {
  const updated: SocialAccount = {
    ...account,
    verificationState: state,
    updatedAt: new Date().toISOString(),
  };
  await saveSocialAccount(updated);
  return updated;
}

export async function getSocialSummary(userId: string): Promise<SocialSummary> {
  const accounts = await listSocialAccountsForUser(userId);
  return {
    accounts,
    verifiedCount: accounts.filter((account) => account.verificationState === "VERIFIED").length,
    scoreStatus: "NOT_STARTED",
    score: null,
    confidence: null,
  };
}

export async function claimXAccount(userId: string, usernameInput: string) {
  const username = normalizeXUsername(usernameInput);
  if (!isValidXUsername(username)) {
    throw new GwapScoreSocialError("Enter a valid X username", 400);
  }

  let resolved;
  try {
    resolved = await adapter.resolveUser(username);
  } catch (error) {
    if (error instanceof XPlatformError) {
      throw new GwapScoreSocialError(error.message, error.status);
    }
    throw error;
  }

  const existingAccountId = await getAccountIdForPlatformIdentity("x", resolved.id);
  if (existingAccountId) {
    const existing = await getSocialAccount(existingAccountId);
    if (existing?.gwapUserId !== userId) {
      throw new GwapScoreSocialError(
        "This X account is already linked to another GWAP account",
        409,
      );
    }
    if (existing) {
      const refreshed = {
        ...existing,
        currentUsername: resolved.username,
        displayName: resolved.name,
        updatedAt: new Date().toISOString(),
      } satisfies SocialAccount;
      await saveSocialAccount(refreshed);
      return refreshed;
    }
  }

  const now = new Date().toISOString();
  const account: SocialAccount = {
    id: randomUUID(),
    gwapUserId: userId,
    platform: "x",
    platformUserId: resolved.id,
    currentUsername: resolved.username,
    displayName: resolved.name,
    verificationMethod: "PROOF_OF_CONTROL_DM",
    verificationState: "ACCOUNT_CLAIMED",
    followStatus: "pending",
    verifiedAt: null,
    verificationExpiresAt: null,
    monitoringStatus: "NOT_STARTED",
    observationFrequencyHours: 12,
    lastObservedAt: null,
    nextObservationAt: null,
    baselineStartedAt: null,
    activeChallengeId: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveSocialAccount(account);
  await recordEvent(account, "ACCOUNT_CLAIMED", { username: resolved.username });
  emitTelemetry("account_claimed", { platform: "x" });
  return account;
}

export async function issueChallenge(userId: string, accountId: string) {
  const account = await getOwnedSocialAccount(userId, accountId);
  if (!account) throw new GwapScoreSocialError("Social account not found", 404);
  if (account.verificationState === "VERIFIED") {
    throw new GwapScoreSocialError("This account is already verified", 409);
  }

  if (account.activeChallengeId) {
    const previous = await getChallenge(account.activeChallengeId);
    if (previous?.state === "active") {
      const revoked = { ...previous, state: "revoked" as const };
      await updateChallenge(revoked);
      await deleteChallengeHashIndex(revoked);
    }
  }

  const now = new Date();
  const rawChallenge = generateVerificationChallenge();
  const challengeHash = hashVerificationChallenge(rawChallenge, challengeSecret());
  const challenge: VerificationChallenge = {
    id: randomUUID(),
    socialAccountId: account.id,
    platform: "x",
    challengeHash,
    state: "active",
    createdAt: now.toISOString(),
    expiresAt: addMilliseconds(now, VERIFICATION_CHALLENGE_TTL_MS),
    consumedAt: null,
  };
  await saveChallenge(challenge, CHALLENGE_TTL_SECONDS);
  const updated = await setAccountState(
    { ...account, activeChallengeId: challenge.id, followStatus: "pending" },
    "AWAITING_DM",
  );
  await recordEvent(updated, "CHALLENGE_CREATED", { challengeId: challenge.id });
  emitTelemetry("challenge_created", { platform: "x" });

  return {
    challengeId: challenge.id,
    challenge: rawChallenge,
    expiresAt: challenge.expiresAt,
    account: updated,
  };
}

async function expireChallenge(account: SocialAccount, challenge: VerificationChallenge) {
  const expired: VerificationChallenge = { ...challenge, state: "expired" };
  await updateChallenge(expired);
  await deleteChallengeHashIndex(expired);
  const updated = await setAccountState(
    { ...account, activeChallengeId: null },
    "REVERIFY_REQUIRED",
  );
  await recordEvent(updated, "CHALLENGE_EXPIRED", { challengeId: challenge.id });
  emitTelemetry("challenge_expired", { platform: account.platform });
  return updated;
}

export async function getChallengeStatus(userId: string, challengeId: string) {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new GwapScoreSocialError("Challenge not found or expired", 404);
  const account = await getOwnedSocialAccount(userId, challenge.socialAccountId);
  if (!account) throw new GwapScoreSocialError("Challenge not found", 404);
  if (challenge.state === "active" && isChallengeExpired(challenge.expiresAt)) {
    const updated = await expireChallenge(account, challenge);
    return { challenge: { ...challenge, state: "expired" as const }, account: updated };
  }
  return { challenge, account };
}

async function processChallenge(
  challenge: VerificationChallenge,
  account: SocialAccount,
  prefetchedMessages?: Awaited<ReturnType<XAdapter["collectVerificationMessages"]>>,
) {
  if (challenge.state !== "active") return { challenge, account, matched: false };
  if (isChallengeExpired(challenge.expiresAt)) {
    const updated = await expireChallenge(account, challenge);
    return { challenge: { ...challenge, state: "expired" as const }, account: updated, matched: false };
  }

  let messages = prefetchedMessages;
  try {
    messages ??= await adapter.collectVerificationMessages();
  } catch (error) {
    if (error instanceof XPlatformError) {
      throw new GwapScoreSocialError(error.message, error.status);
    }
    throw error;
  }

  const createdAt = new Date(challenge.createdAt).getTime();
  const match = messages.find((message) => {
    if (message.senderId !== account.platformUserId) return false;
    if (new Date(message.createdAt).getTime() < createdAt) return false;
    const messageHash = hashVerificationChallenge(message.text, challengeSecret());
    return challengeHashesMatch(messageHash, challenge.challengeHash);
  });

  if (!match) return { challenge, account, matched: false };

  let updated = await setAccountState(account, "DM_RECEIVED");
  await recordEvent(updated, "DM_RECEIVED", { messageId: match.id });
  emitTelemetry("verification_dm_received", { platform: account.platform });

  updated = await setAccountState(updated, "ACCOUNT_MATCHED");
  await recordEvent(updated, "ACCOUNT_MATCHED", { platformUserId: account.platformUserId });
  emitTelemetry("verification_account_matched", { platform: account.platform });

  let follow: boolean | "unsupported" = "unsupported";
  try {
    follow = await adapter.verifyFollow(account.platformUserId);
  } catch (error) {
    if (error instanceof XPlatformError && [401, 403, 429].includes(error.status)) {
      follow = "unsupported";
    } else {
      throw error;
    }
  }

  if (follow === false) {
    updated = {
      ...updated,
      followStatus: "not_following",
      updatedAt: new Date().toISOString(),
    };
    await saveSocialAccount(updated);
    await recordEvent(updated, "FOLLOW_NOT_CONFIRMED");
    return { challenge, account: updated, matched: true, followRequired: true };
  }

  if (follow === true) {
    updated = await setAccountState(
      { ...updated, followStatus: "confirmed" },
      "FOLLOW_CONFIRMED",
    );
    await recordEvent(updated, "FOLLOW_CONFIRMED");
    emitTelemetry("verification_follow_confirmed", { platform: account.platform });
  } else {
    updated = { ...updated, followStatus: "unsupported" };
  }

  const verifiedAt = new Date().toISOString();
  updated = await setAccountState(
    {
      ...updated,
      verifiedAt,
      activeChallengeId: null,
      monitoringStatus: "READY",
    },
    "VERIFIED",
  );
  const consumed = { ...challenge, state: "consumed" as const, consumedAt: verifiedAt };
  await updateChallenge(consumed);
  await deleteChallengeHashIndex(consumed);
  await recordEvent(updated, "ACCOUNT_VERIFIED", { verificationMethod: "PROOF_OF_CONTROL_DM" });
  emitTelemetry("verification_completed", { platform: account.platform });

  return { challenge: consumed, account: updated, matched: true, verified: true };
}

export async function checkChallenge(userId: string, challengeId: string) {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new GwapScoreSocialError("Challenge not found or expired", 404);
  const account = await getOwnedSocialAccount(userId, challenge.socialAccountId);
  if (!account) throw new GwapScoreSocialError("Challenge not found", 404);
  return processChallenge(challenge, account);
}

export async function processActiveXChallenges() {
  const ids = await getActiveChallengeIds();
  const keep: string[] = [];
  let verified = 0;
  let expired = 0;
  let messages: Awaited<ReturnType<XAdapter["collectVerificationMessages"]>> | undefined;

  if (ids.length > 0) {
    try {
      messages = await adapter.collectVerificationMessages();
    } catch (error) {
      if (error instanceof XPlatformError) {
        throw new GwapScoreSocialError(error.message, error.status);
      }
      throw error;
    }
  }

  for (const id of ids) {
    const challenge = await getChallenge(id);
    if (!challenge || challenge.platform !== "x") continue;
    const account = await getSocialAccount(challenge.socialAccountId);
    if (!account || account.platform !== "x") continue;
    if (challenge.state !== "active") continue;

    const result = await processChallenge(challenge, account, messages);
    if (result.challenge.state === "active") keep.push(id);
    if (result.challenge.state === "expired") expired += 1;
    if (result.account.verificationState === "VERIFIED") verified += 1;
  }

  await replaceActiveChallengeIds(keep);
  return { processed: ids.length, active: keep.length, verified, expired };
}
