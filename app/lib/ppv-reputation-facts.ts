import { isPpvReceiptV1, type PpvReceiptV1, type ReputationEventType, type SourceProduct } from "./ppv-reputation/contracts.ts";
import { sealRank } from "./ppv-reputation/seal-state.ts";

/**
 * Factual aggregate of a wallet's PPV activity. This is the only shape the
 * GwapScore consumer reads. It counts; it never weighs. Any scoring model can
 * be swapped without touching stored proofs, events or receipts because the
 * aggregate is recomputed from receipts on demand.
 */

export const REPUTATION_FACTS_SCHEMA_VERSION = 1 as const;

export type ReputationFactsV1 = {
  schemaVersion: typeof REPUTATION_FACTS_SCHEMA_VERSION;
  wallet: string;
  computedAt: string;
  receiptCount: number;
  /** Receipts whose seal state is at least `verified` (chain re-read matched). */
  verifiedReceiptCount: number;
  eventCounts: Partial<Record<ReputationEventType, number>>;
  outcomeCounts: Record<string, number>;
  productCounts: Partial<Record<SourceProduct, number>>;
  roleCounts: Record<string, number>;
  settledCount: number;
  counterpartyConfirmedCount: number;
  disputesOpened: number;
  disputesResolved: number;
  activeDisputes: number;
  revokedProofs: number;
  distinctCounterparties: number;
  repeatCounterparties: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
};

export function computeReputationFacts(wallet: string, receipts: readonly unknown[], now = new Date()): ReputationFactsV1 {
  const valid = receipts.filter((r): r is PpvReceiptV1 => isPpvReceiptV1(r) && r.holderWallet === wallet);
  const eventCounts: Partial<Record<ReputationEventType, number>> = {};
  const outcomeCounts: Record<string, number> = {};
  const productCounts: Partial<Record<SourceProduct, number>> = {};
  const roleCounts: Record<string, number> = {};
  const counterpartySeen = new Map<string, number>();
  let verified = 0;
  let settled = 0;
  let confirmed = 0;
  let disputesOpened = 0;
  let disputesResolved = 0;
  let revoked = 0;
  const activeDisputeSubjects = new Set<string>();
  let first: string | null = null;
  let last: string | null = null;

  for (const receipt of valid) {
    eventCounts[receipt.eventType] = (eventCounts[receipt.eventType] ?? 0) + 1;
    outcomeCounts[receipt.outcome] = (outcomeCounts[receipt.outcome] ?? 0) + 1;
    roleCounts[receipt.role] = (roleCounts[receipt.role] ?? 0) + 1;
    if (receipt.sourceProduct) productCounts[receipt.sourceProduct] = (productCounts[receipt.sourceProduct] ?? 0) + 1;
    if (sealRank(receipt.sealState) >= sealRank("verified")) verified += 1;
    if (receipt.eventType === "settlement.completed" || receipt.eventType === "invoice.paid") settled += 1;
    if (receipt.eventType === "agreement.executed" || receipt.eventType === "milestone.approved") confirmed += 1;
    if (receipt.eventType === "dispute.opened") disputesOpened += 1;
    if (receipt.eventType === "dispute.resolved") disputesResolved += 1;
    if (receipt.eventType === "proof.revoked") revoked += 1;
    if (receipt.disputeOpen) activeDisputeSubjects.add(receipt.agreementId ?? receipt.ppvProofId ?? receipt.eventId);
    for (const counterparty of receipt.counterpartyWallets) {
      counterpartySeen.set(counterparty, (counterpartySeen.get(counterparty) ?? 0) + 1);
    }
    if (!first || receipt.completedAt < first) first = receipt.completedAt;
    if (!last || receipt.completedAt > last) last = receipt.completedAt;
  }

  return {
    schemaVersion: REPUTATION_FACTS_SCHEMA_VERSION,
    wallet,
    computedAt: now.toISOString(),
    receiptCount: valid.length,
    verifiedReceiptCount: verified,
    eventCounts,
    outcomeCounts,
    productCounts,
    roleCounts,
    settledCount: settled,
    counterpartyConfirmedCount: confirmed,
    disputesOpened,
    disputesResolved,
    activeDisputes: activeDisputeSubjects.size,
    revokedProofs: revoked,
    distinctCounterparties: counterpartySeen.size,
    repeatCounterparties: [...counterpartySeen.values()].filter((count) => count > 1).length,
    firstActivityAt: first,
    lastActivityAt: last,
  };
}

export function isReputationFactsV1(value: unknown): value is ReputationFactsV1 {
  if (!value || typeof value !== "object") return false;
  const facts = value as Partial<ReputationFactsV1>;
  return (
    facts.schemaVersion === REPUTATION_FACTS_SCHEMA_VERSION &&
    typeof facts.wallet === "string" &&
    typeof facts.receiptCount === "number" &&
    typeof facts.verifiedReceiptCount === "number" &&
    typeof facts.settledCount === "number" &&
    typeof facts.disputesOpened === "number" &&
    typeof facts.disputesResolved === "number" &&
    typeof facts.activeDisputes === "number" &&
    typeof facts.distinctCounterparties === "number"
  );
}
