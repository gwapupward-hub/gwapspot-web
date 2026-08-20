import "server-only";

import type { WalletIdentity } from "../../lib/privy-server";
import { getOrCreateGwapAccount } from "../../lib/gwap-account";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../lib/redis";
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
