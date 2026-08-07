import "server-only";

import { PrivyClient, type User } from "@privy-io/node";
import { cookies } from "next/headers";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

const IDENTITY_CACHE_SECONDS = 5 * 60;

let privyClient: PrivyClient | null = null;

export type WalletIdentity = {
  userId: string;
  displayName: string;
  email: string;
  embeddedWallet: string | null;
  verifiedWallet: string;
  walletProvider: "embedded" | "external";
};

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
  };
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

export async function getAuthenticatedWalletIdentity(request?: Request) {
  const accessToken = await getAccessToken(request);
  if (!accessToken) return null;

  try {
    const client = getPrivyServerClient();
    const claims = await client.utils().auth().verifyAccessToken(accessToken);
    const cacheKey = getPrivateStorageKey("identity", claims.user_id);
    const redis = getWorkspaceRedis();
    const cached = await redis.get<WalletIdentity>(cacheKey);
    if (cached?.userId === claims.user_id && cached.verifiedWallet) return cached;

    const user = await client.users()._get(claims.user_id);
    const identity = identityFromUser(user);
    if (!identity) return null;

    await redis.set(cacheKey, identity, { ex: IDENTITY_CACHE_SECONDS });
    return identity;
  } catch {
    return null;
  }
}

export async function clearWalletIdentityCache(userId: string) {
  await getWorkspaceRedis().del(getPrivateStorageKey("identity", userId));
}
