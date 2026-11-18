import "server-only";

// Test-branch integration seam only. NOT registered as an API route.
// Uses GwapOS's existing Privy authentication and Redis-backed canonical
// GWAP account mapping. No new login, no new session issuer, no account write.
import { getAuthenticatedWalletIdentityResult } from "./privy-server";
import { getGwapAccountForWallet } from "./gwap-account";
import { decideVerifiedMessengerSession, type VerifiedMessengerSession } from "./messenger-verified-session-core";

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

  return decideVerifiedMessengerSession(auth, existing);
}

// BEFORE integration with actual route handlers:
// - require same-origin request + server-side rate limits;
// - bind challenge to HttpOnly Privy session and stable account;
// - use a trusted, two-RPC-finalized GNS V2 proof, NOT /resolve owner alone;
// - validate real signed OpenMLS credential identity and nonce;
// - require explicit wallet signMessage approval;
// - use transactional durable challenges, not test-only memory;
// - do not enable public Preview / production without separate approval.
