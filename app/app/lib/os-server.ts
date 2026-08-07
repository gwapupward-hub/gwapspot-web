import "server-only";

import type { WalletIdentity } from "../../lib/privy-server";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../lib/redis";
import {
  defaultGwapOsState,
  createDefaultGwapOsState,
  normalizeGwapOsState,
  type GwapAccount,
  type GwapOsState,
} from "./os-state";

function workspaceKey(userId: string) {
  return getPrivateStorageKey("workspace", userId);
}

export async function loadAccountWorkspace(identity: WalletIdentity) {
  const storedState = await getWorkspaceRedis().get<unknown>(
    workspaceKey(identity.userId),
  );
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

  return { account, hasCloudState, state };
}

export async function saveAccountWorkspace(userId: string, state: GwapOsState) {
  await getWorkspaceRedis().set(workspaceKey(userId), state);
}

export async function clearAccountWorkspace(userId: string) {
  await getWorkspaceRedis().del(workspaceKey(userId));
}
