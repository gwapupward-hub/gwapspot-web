import type { ChainVerification } from "./ppv-reputation-projection.ts";

/**
 * Pure authority checks for anchoring a PPV deliverable. Kept apart from
 * `ppv-reputation-server.ts` (which pulls in `server-only`, live Redis and a
 * live Solana connection at import time) so these security-critical checks
 * can be exercised directly by the Node test runner without a server
 * environment.
 */

export class DeliverableRegistrationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DeliverableRegistrationError";
    this.status = status;
  }
}

type DraftAuthorityFields = { creatorWallet: string };
type DraftChainFields = { ppvProofId: string; proofHash: string };

/**
 * A caller may only anchor a deliverable to a proof they authored. Checked
 * against the request body before any chain read, so a spoofed
 * `creatorWallet` never triggers an RPC call on someone else's behalf.
 */
export function assertCallerIsCreator(draft: DraftAuthorityFields, callerWallet: string): void {
  if (draft.creatorWallet !== callerWallet) throw new DeliverableRegistrationError("Only the proof authority can anchor a deliverable.", 403);
}

/**
 * The on-chain proof account is the only source of truth for who may anchor
 * a deliverable against it. A client-submitted `creatorWallet`/`proofHash`
 * that does not match what is actually on chain is rejected here, so neither
 * a forged authority nor a forged content hash can produce a reputation
 * event.
 */
export function assertChainMatchesDraft(draft: DraftChainFields, chain: ChainVerification, callerWallet: string): void {
  if (!chain.exists) throw new DeliverableRegistrationError("That PPV proof does not exist on chain.", 404);
  if (chain.revoked) throw new DeliverableRegistrationError("That PPV proof has been revoked.", 409);
  if (chain.authority !== callerWallet) throw new DeliverableRegistrationError("That PPV proof belongs to a different wallet.", 403);
  if (chain.contentHash !== draft.proofHash) throw new DeliverableRegistrationError("The proof hash does not match the on-chain commitment.", 409);
}
