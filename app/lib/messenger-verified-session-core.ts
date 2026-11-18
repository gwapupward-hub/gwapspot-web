import type { WalletIdentityResult } from "./privy-server";
import type { GwapAccountRecord } from "./gwap-account-core";

export type VerifiedMessengerSession =
  | { status: "ready"; authenticated: true; subject: string; accountId: string; verifiedWallet: string }
  | { status: "unauthenticated" | "unavailable" | "account_mismatch" };

// Pure, independently testable authorization contract. GwapOS's real
// server adapter supplies verified Privy identity and canonical Redis account.
// No account/user/wallet identifiers are accepted from client body fields.
export function decideVerifiedMessengerSession(
  auth: WalletIdentityResult,
  existing: GwapAccountRecord | null,
): VerifiedMessengerSession {
  if (auth.status !== "ready") return { status: auth.status };

  if (
    !existing ||
    !existing.privyUserIds.includes(auth.identity.userId) ||
    existing.primaryWallet !== auth.identity.verifiedWallet ||
    !existing.wallets.some((wallet) => wallet.address === auth.identity.verifiedWallet) ||
    !/^gwap_[A-Za-z0-9_-]{20,64}$/.test(existing.id)
  ) {
    return { status: "account_mismatch" };
  }
  return {
    status: "ready",
    authenticated: true,
    subject: auth.identity.userId,
    accountId: existing.id,
    verifiedWallet: auth.identity.verifiedWallet,
  };
}
