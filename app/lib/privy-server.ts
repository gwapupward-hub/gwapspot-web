import "server-only";

import { PrivyClient, type User } from "@privy-io/node";
import { cookies } from "next/headers";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import { walletProviderLabel } from "./wallet-provider-label";

const IDENTITY_CACHE_SECONDS = 5 * 60;
const WALLET_PROVISION_RETRY_DELAYS_MS = [0, 200, 500, 900] as const;

let privyClient: PrivyClient | null = null;

export type WalletIdentity = {
  userId: string;
  displayName: string;
  email: string;
  embeddedWallet: string | null;
  verifiedWallet: string;
  walletProvider: "embedded" | "external";
  // A human-readable name for the wallet actually connected (e.g. "Phantom",
  // "Jupiter", "GWAP Wallet" for an embedded one) - distinct from
  // walletProvider above, which only says embedded vs. external and doesn't
  // distinguish which external wallet it is.
  walletProviderLabel: string;
};

// "unauthenticated" means the request itself proves nothing: no token, or a
// token that failed verification (expired, malformed, wrong audience). It is
// safe to send the caller to sign in.
//
// "unavailable" means the token verified, but looking up the identity behind
// it failed (Redis or the Privy user-lookup threw). The wallet may be fully
// authenticated; treating this the same as "unauthenticated" is what used to
// bounce a valid session back to sign-in, which bounces right back to /app,
// which fails the same lookup again — an infinite loop driven by a transient
// backend hiccup rather than by anything wrong with the session.
export type WalletIdentityResult =
  | { status: "ready"; identity: WalletIdentity }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export function getPrivyServerClient() {
  if (privyClient) return privyClient;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Privy is not configured");

  privyClient = new PrivyClient({ appId, appSecret });
  return privyClient;
}

function identityFromUser(user: User): WalletIdentity | null {
  const emailAccount = user.linked_accounts.find(
    (account) => account.type === "email",
  );
  const solanaWallets = user.linked_accounts.filter(
    (account) => account.type === "wallet" && account.chain_type === "solana",
  );
  const embeddedWallet = solanaWallets.find(
    (account) => account.connector_type === "embedded",
  );
  const wallet =
    solanaWallets.find((account) => account.connector_type !== "embedded") ??
    embeddedWallet;

  if (!wallet) return null;

  const email = emailAccount?.address ?? "Wallet account";
  const walletLabel = `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`;
  const displayName = emailAccount
    ? emailAccount.address.split("@")[0] || "GWAP Builder"
    : `Wallet ${walletLabel}`;

  return {
    userId: user.id,
    displayName,
    email,
    embeddedWallet: embeddedWallet?.address ?? null,
    verifiedWallet: wallet.address,
    walletProvider:
      wallet.connector_type === "embedded" ? "embedded" : "external",
    walletProviderLabel: walletProviderLabel(wallet),
  };
}

async function identityFromPrivyWithProvisioningRetry(
  userId: string,
): Promise<WalletIdentity | null> {
  for (let attempt = 0; attempt < WALLET_PROVISION_RETRY_DELAYS_MS.length; attempt += 1) {
    const delayMs = WALLET_PROVISION_RETRY_DELAYS_MS[attempt] ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const user = await getPrivyServerClient().users()._get(userId);
    const identity = identityFromUser(user);
    if (identity) return identity;
  }

  return null;
}


function getBearerToken(request?: Request) {
  const authorization = request?.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

async function getAccessToken(request?: Request) {
  const bearer = getBearerToken(request);
  if (bearer) return bearer;

  const cookieStore = await cookies();
  return cookieStore.get("privy-token")?.value ?? null;
}

export async function getAuthenticatedWalletIdentityResult(
  request?: Request,
): Promise<WalletIdentityResult> {
  const accessToken = await getAccessToken(request);
  if (!accessToken) return { status: "unauthenticated" };

  let userId: string;
  try {
    const claims = await getPrivyServerClient()
      .utils()
      .auth()
      .verifyAccessToken(accessToken);
    userId = claims.user_id;
  } catch {
    // The token itself is bad (expired, malformed, wrong audience). This is
    // a real "not signed in", not a backend problem.
    return { status: "unauthenticated" };
  }

  try {
    const cacheKey = getPrivateStorageKey("identity", userId);
    const redis = getWorkspaceRedis();
    const cached = await redis.get<WalletIdentity>(cacheKey);
    // A cached entry written before walletProviderLabel existed would be
    // missing it - treat that shape as a miss rather than serving a partial
    // identity that crashes the first thing that reads the field, and let
    // it re-fetch and re-cache the complete shape below.
    if (
      cached?.userId === userId &&
      cached.verifiedWallet &&
      typeof cached.walletProviderLabel === "string"
    ) {
      return { status: "ready", identity: cached };
    }

    const identity = await identityFromPrivyWithProvisioningRetry(userId);
    // The access token already verified. A temporarily missing Solana wallet is
    // most commonly an email OTP user whose embedded wallet is still being
    // provisioned. Do not misclassify that valid session as signed out and
    // bounce it back through the login flow.
    if (!identity) return { status: "unavailable" };

    await redis.set(cacheKey, identity, { ex: IDENTITY_CACHE_SECONDS });
    return { status: "ready", identity };
  } catch {
    // The token was valid; looking up the identity behind it failed. Redis
    // or the Privy user-lookup is having a moment — the wallet may still be
    // fully authenticated, so this must not be treated as "sign in again".
    return { status: "unavailable" };
  }
}

export async function getAuthenticatedWalletIdentity(request?: Request) {
  const result = await getAuthenticatedWalletIdentityResult(request);
  return result.status === "ready" ? result.identity : null;
}

export async function clearWalletIdentityCache(userId: string) {
  await getWorkspaceRedis().del(getPrivateStorageKey("identity", userId));
}
