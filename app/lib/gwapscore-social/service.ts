import "server-only";

import { randomUUID } from "node:crypto";
import {
  addMilliseconds,
  buildVerificationShareUrl,
  buildXVerificationPostIntentUrl,
  buildXVerificationPostText,
  challengeHashesMatch,
  extractVerificationChallenges,
  generateVerificationChallenge,
  hashVerificationChallenge,
  isChallengeExpired,
  isValidXUsername,
  isVerificationCardTheme,
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
  PlatformPost,
  SocialAccount,
  SocialSummary,
  VerificationCardTheme,
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
  const secret = process.env.GWAPSCORE_CHALLENGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new GwapScoreSocialError(
      "GwapScore challenge security is not configured",
      503,
    );
  }
  return secret;
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

  if (resolved.protected) {
    throw new GwapScoreSocialError(
      "X account must be public while Proof of Control is being verified",
      400,
    );
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
      const legacyPrivateFlow =
        existing.verificationMethod !== "PROOF_OF_CONTROL_PUBLIC_POST" ||
        (["AWAITING_DM", "DM_RECEIVED"] as string[]).includes(existing.verificationState);

      if (legacyPrivateFlow && existing.activeChallengeId) {
        const previous = await getChallenge(existing.activeChallengeId);
        if (previous?.state === "active") {
          const revoked = { ...previous, state: "revoked" as const };
          await updateChallenge(revoked);
          await deleteChallengeHashIndex(revoked);
        }
      }

      const refreshed: SocialAccount = {
        ...existing,
        currentUsername: resolved.username,
        displayName: resolved.name,
        verificationMethod: "PROOF_OF_CONTROL_PUBLIC_POST",
        verificationState: legacyPrivateFlow ? "ACCOUNT_CLAIMED" : existing.verificationState,
        verificationProofPostId: legacyPrivateFlow
          ? null
          : existing.verificationProofPostId ?? null,
        activeChallengeId: legacyPrivateFlow ? null : existing.activeChallengeId,
        followStatus: legacyPrivateFlow ? "pending" : existing.followStatus,
        updatedAt: new Date().toISOString(),
      };
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
    verificationMethod: "PROOF_OF_CONTROL_PUBLIC_POST",
    verificationState: "ACCOUNT_CLAIMED",
    followStatus: "pending",
    verificationProofPostId: null,
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

export async function issueChallenge(
  userId: string,
  accountId: string,
  cardTheme: VerificationCardTheme,
) {
  if (!isVerificationCardTheme(cardTheme)) {
    throw new GwapScoreSocialError(
      "Choose a verification card before generating the X post",
      400,
    );
  }

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
  const challengeId = randomUUID();
  const rawChallenge = generateVerificationChallenge();
  const challengeHash = hashVerificationChallenge(rawChallenge, challengeSecret());
  const verificationShareUrl = buildVerificationShareUrl(challengeId);
  const verificationPostText = buildXVerificationPostText(
    account.currentUsername,
    rawChallenge,
    verificationShareUrl,
  );
  const challenge: VerificationChallenge = {
    id: challengeId,
    socialAccountId: account.id,
    platform: "x",
    challengeHash,
    cardTheme,
    state: "active",
    createdAt: now.toISOString(),
    expiresAt: addMilliseconds(now, VERIFICATION_CHALLENGE_TTL_MS),
    consumedAt: null,
  };
  await saveChallenge(challenge, CHALLENGE_TTL_SECONDS);

  let updated = await setAccountState(
    {
      ...account,
      activeChallengeId: challenge.id,
      followStatus: "pending",
      verificationProofPostId: null,
    },
    "CHALLENGE_ISSUED",
  );
  await recordEvent(updated, "CHALLENGE_CREATED", {
    challengeId: challenge.id,
    cardTheme,
  });
  emitTelemetry("challenge_created", { platform: "x", cardTheme });
  updated = await setAccountState(updated, "AWAITING_POST");

  return {
    challengeId: challenge.id,
    challenge: rawChallenge,
    cardTheme,
    verificationShareUrl,
    verificationPostText,
    postIntentUrl: buildXVerificationPostIntentUrl(
      updated.currentUsername,
      rawChallenge,
      verificationShareUrl,
    ),
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

function postContainsChallenge(post: PlatformPost, challenge: VerificationChallenge) {
  return extractVerificationChallenges(post.text).some((candidate) => {
    const candidateHash = hashVerificationChallenge(candidate, challengeSecret());
    return challengeHashesMatch(candidateHash, challenge.challengeHash);
  });
}

async function processChallenge(
  challenge: VerificationChallenge,
  account: SocialAccount,
  prefetchedPosts?: PlatformPost[],
) {
  if (challenge.state !== "active") return { challenge, account, matched: false };
  if (isChallengeExpired(challenge.expiresAt)) {
    const updated = await expireChallenge(account, challenge);
    return {
      challenge: { ...challenge, state: "expired" as const },
      account: updated,
      matched: false,
    };
  }

  const alreadyMatched =
    account.verificationState === "ACCOUNT_MATCHED" &&
    account.followStatus === "not_following" &&
    Boolean(account.verificationProofPostId);

  let updated = account;
  if (!alreadyMatched) {
    let posts = prefetchedPosts;
    try {
      posts ??= await adapter.getRecentPosts(account.platformUserId);
    } catch (error) {
      if (error instanceof XPlatformError) {
        throw new GwapScoreSocialError(
          "X public-post verification is temporarily unavailable",
          error.status >= 500 ? error.status : 503,
        );
      }
      throw error;
    }

    const createdAt = new Date(challenge.createdAt).getTime();
    const match = posts.find((post) => {
      if (post.authorId !== account.platformUserId) return false;
      if (new Date(post.createdAt).getTime() < createdAt) return false;
      return postContainsChallenge(post, challenge);
    });

    if (!match) return { challenge, account, matched: false };

    updated = await setAccountState(
      { ...account, verificationProofPostId: match.id },
      "POST_DETECTED",
    );
    await recordEvent(updated, "POST_DETECTED", { postId: match.id });
    emitTelemetry("verification_post_detected", { platform: account.platform });

    updated = await setAccountState(updated, "ACCOUNT_MATCHED");
    await recordEvent(updated, "ACCOUNT_MATCHED", {
      platformUserId: account.platformUserId,
      postId: match.id,
    });
    emitTelemetry("verification_account_matched", { platform: account.platform });
  }

  let follow: boolean | "unsupported";
  try {
    follow = await adapter.verifyFollow(account.platformUserId);
  } catch (error) {
    if (error instanceof XPlatformError) {
      throw new GwapScoreSocialError(
        "X follow verification is temporarily unavailable",
        error.status >= 500 ? error.status : 503,
      );
    }
    throw error;
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
  const consumed = {
    ...challenge,
    state: "consumed" as const,
    consumedAt: verifiedAt,
  };
  await updateChallenge(consumed);
  await deleteChallengeHashIndex(consumed);
  await recordEvent(updated, "ACCOUNT_VERIFIED", {
    verificationMethod: "PROOF_OF_CONTROL_PUBLIC_POST",
    proofPostId: updated.verificationProofPostId,
    verificationCardTheme: challenge.cardTheme ?? "green",
  });
  emitTelemetry("verification_completed", { platform: account.platform });

  return {
    challenge: consumed,
    account: updated,
    matched: true,
    verified: true,
  };
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
  const postsByUserId = new Map<string, PlatformPost[]>();

  for (const id of ids) {
    const challenge = await getChallenge(id);
    if (!challenge || challenge.platform !== "x") continue;
    const account = await getSocialAccount(challenge.socialAccountId);
    if (!account || account.platform !== "x") continue;
    if (challenge.state !== "active") continue;

    let posts = postsByUserId.get(account.platformUserId);
    if (!posts && account.verificationState !== "ACCOUNT_MATCHED") {
      try {
        posts = await adapter.getRecentPosts(account.platformUserId);
        postsByUserId.set(account.platformUserId, posts);
      } catch (error) {
        if (error instanceof XPlatformError) {
          throw new GwapScoreSocialError(error.message, error.status);
        }
        throw error;
      }
    }

    const result = await processChallenge(challenge, account, posts);
    if (result.challenge.state === "active") keep.push(id);
    if (result.challenge.state === "expired") expired += 1;
    if (result.account.verificationState === "VERIFIED") verified += 1;
  }

  await replaceActiveChallengeIds(keep);
  return { processed: ids.length, active: keep.length, verified, expired };
}
