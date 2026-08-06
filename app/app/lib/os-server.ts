import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  defaultGwapOsState,
  createDefaultGwapOsState,
  normalizeGwapOsState,
  type GwapAccount,
  type GwapOsState,
} from "./os-state";

const STATE_METADATA_KEY = "gwapOsState";

export async function loadAccountWorkspace(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const storedState = user.privateMetadata[STATE_METADATA_KEY];
  const hasCloudState = Boolean(storedState && typeof storedState === "object");
  const verifiedWallet =
    user.primaryWeb3Wallet?.web3Wallet ?? user.web3Wallets[0]?.web3Wallet ?? "";
  const displayName = user.fullName || user.username || "GWAP Builder";
  const account: GwapAccount = {
    displayName,
    email: user.primaryEmailAddress?.emailAddress ?? "Wallet account",
    verifiedWallet,
  };

  const state = hasCloudState
    ? normalizeGwapOsState(storedState)
    : {
        ...createDefaultGwapOsState(),
        profile: {
          ...defaultGwapOsState.profile,
          displayName,
          handle: user.username ?? defaultGwapOsState.profile.handle,
          primaryWallet: verifiedWallet,
        },
      };

  if (verifiedWallet && state.profile.primaryWallet !== verifiedWallet) {
    state.profile = { ...state.profile, primaryWallet: verifiedWallet };
  }

  return { account, hasCloudState, state };
}

export async function saveAccountWorkspace(userId: string, state: GwapOsState) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { [STATE_METADATA_KEY]: state },
  });
}

export async function clearAccountWorkspace(userId: string) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { [STATE_METADATA_KEY]: null },
  });
}
