import "server-only";

import type { WalletIdentity } from "../../lib/privy-server";
import { getOrCreateGwapAccount } from "../../lib/gwap-account";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../lib/redis";
import { getGnsProfileUrl } from "./gns";
import {
  defaultGwapOsState,
  createDefaultGwapOsState,
  normalizeGwapOsState,
  type GnsIdentity,
  type GwapAccount,
  type GwapOsState,
} from "./os-state";

function workspaceKey(subject: string) {
  return getPrivateStorageKey("workspace", subject);
}

function normalizeCachedGnsName(value: string | null) {
  if (!value) return null;
  const name = value.trim().toLowerCase().replace(/\.gwap$/i, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(name) ? name : null;
}

export function cachedGnsIdentity(primaryGnsIdentity: string | null): GnsIdentity {
  const name = normalizeCachedGnsName(primaryGnsIdentity);
  if (!name) {
    return {
      status: "none",
      name: null,
      fullName: null,
      avatar: null,
      bio: null,
      score: null,
      scoreTier: null,
      scoreStatus: "unavailable",
      scoreMessage: "GwapScore loads independently from GNS identity.",
      verified: false,
      isGenesis: false,
      tier: null,
      profileUrl: null,
      updatedAt: null,
    };
  }

  return {
    status: "found",
    name,
    fullName: `${name}.gwap`,
    avatar: null,
    bio: null,
    score: null,
    scoreTier: null,
    scoreStatus: "unavailable",
    scoreMessage: "GwapScore loads independently from GNS identity.",
    verified: true,
    isGenesis: false,
    tier: null,
    profileUrl: getGnsProfileUrl(name),
    updatedAt: null,
  };
}

export async function loadAccountWorkspace(identity: WalletIdentity) {
  const redis = getWorkspaceRedis();
  const gwapAccount = await getOrCreateGwapAccount(identity);
  const canonicalKey = workspaceKey(gwapAccount.id);
  const legacyKey = workspaceKey(identity.userId);

  let storedState = await redis.get<unknown>(canonicalKey);
  if (!storedState && canonicalKey !== legacyKey) {
    const legacyState = await redis.get<unknown>(legacyKey);
    if (legacyState && typeof legacyState === "object") {
      await redis.set(canonicalKey, legacyState);
      await redis.del(legacyKey).catch(() => 0);
      storedState = legacyState;
    }
  }

  const hasCloudState = Boolean(storedState && typeof storedState === "object");
  const account: GwapAccount = {
    displayName: identity.displayName,
    email: identity.email,
    embeddedWallet: identity.embeddedWallet,
    verifiedWallet: identity.verifiedWallet,
    walletProvider: identity.walletProvider,
  };

  const state = hasCloudState
    ? normalizeGwapOsState(storedState)
    : {
        ...createDefaultGwapOsState(),
        profile: {
          ...defaultGwapOsState.profile,
          displayName: identity.displayName,
          primaryWallet: identity.verifiedWallet,
        },
      };

  if (state.profile.primaryWallet !== identity.verifiedWallet) {
    state.profile = {
      ...state.profile,
      primaryWallet: identity.verifiedWallet,
    };
  }

  return { account, gwapAccount, hasCloudState, state };
}

export function seedNewWorkspaceFromGns(
  state: GwapOsState,
  hasCloudState: boolean,
  identity: GnsIdentity,
) {
  if (hasCloudState || identity.status !== "found") return state;

  return {
    ...state,
    profile: {
      ...state.profile,
      displayName: identity.fullName || state.profile.displayName,
      handle: identity.name || state.profile.handle,
      bio: identity.bio || state.profile.bio,
      website: identity.profileUrl || state.profile.website,
    },
  };
}

export async function saveAccountWorkspace(gwapUserId: string, state: GwapOsState) {
  await getWorkspaceRedis().set(workspaceKey(gwapUserId), state);
}

export async function clearAccountWorkspace(gwapUserId: string) {
  await getWorkspaceRedis().del(workspaceKey(gwapUserId));
}
