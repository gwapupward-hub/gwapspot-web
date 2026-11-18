import "server-only";

// Test-branch integration seam only. NOT registered as an API route.
// Uses GwapOS's existing Privy authentication and Redis-backed canonical
// GWAP account mapping. No new login, no new session issuer, no account write.
import { getAuthenticatedWalletIdentityResult } from "./privy-server";
import { getGwapAccountForWallet } from "./gwap-account";

export type VerifiedMessengerSession =
  | { status: "ready"; authenticated: true; subject: string; accountId: string; verifiedWallet: string }
  | { status: "unauthenticated" | "unavailable" | "account_mismatch" };

/**
 * Read-only, server-side session identity boundary for a future Messenger API.
 * Do not trust accountId, wallet or subject supplied in a request body.
 * This is NOT permission to enroll devices; a separately verified wallet
 * signMessage, active finalized GNS V2 owner history and signed OpenMLS
 * BasicCredential are required before any enrollment.
 */
export async function resolveVerifiedMessengerSession(
  request: Request,
): Promise<VerifiedMessengerSession> {
  const auth = await getAuthenticatedWalletIdentityResult(request);
  if (auth.status !== "ready") return { status: auth.status };

  // Refuse to silently create a new GWAP account for a messaging session:
  // first complete the existing GwapOS onboarding/account creation flow.
  let existing;
  try {
    existing = await getGwapAccountForWallet(auth.identity.verifiedWallet);
  } catch {
    return { status: "unavailable" };
  }

  // Account mappings may be stale, or the wallet may be a secondary wallet
  // linked to another account. Neither is authority to create an inbox.
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

// BEFORE integration with actual route handlers:
// - require same-origin request + server-side rate limits;
// - bind challenge to HttpOnly Privy session and stable account;
// - use a trusted, two-RPC-finalized GNS V2 proof, NOT /resolve owner alone;
// - validate real signed OpenMLS credential identity and nonce;
// - require explicit wallet signMessage approval;
// - use transactional durable challenges, not test-only memory;
// - do not enable public Preview / production without separate approval.
