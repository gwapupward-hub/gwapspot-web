/** Shortens a Solana address for wallet-native surfaces: `7xF3…9ab2`. */
export function shortenWalletAddress(
  address: string | null | undefined,
  lead = 4,
  tail = 4,
) {
  const value = (address ?? "").trim();
  if (!value) return "";
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

type LinkedAccountLike = {
  type?: string | null;
  chainType?: string | null;
  address?: string | null;
};

/** The authenticated Solana wallet address, if the session has one linked. */
export function findLinkedSolanaAddress(
  linkedAccounts: readonly LinkedAccountLike[] | null | undefined,
) {
  const wallet = (linkedAccounts ?? []).find(
    (account) =>
      account?.type === "wallet" &&
      account?.chainType === "solana" &&
      typeof account?.address === "string" &&
      account.address.length > 0,
  );
  return wallet?.address ?? null;
}
