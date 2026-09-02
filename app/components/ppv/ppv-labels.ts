import type { ParticipantRole, PpvSealState, ReputationEventType, SourceProduct } from "../../lib/ppv-reputation/contracts";

export const PPV_EXPLORER_CLUSTER = "devnet";

export const SEAL_STATE_LABELS: Record<PpvSealState, string> = {
  recorded: "Recorded",
  verified: "PPV Verified",
  counterparty_confirmed: "Counterparty confirmed",
  settled: "Settled · Stamped & Guaranteed",
  dispute_resolved: "Dispute resolved",
  revoked: "Revoked",
};

export const EVENT_TYPE_LABELS: Record<ReputationEventType, string> = {
  "proof.created": "Proof created",
  "proof.revoked": "Proof revoked",
  "proof.submitted": "Deliverable submitted",
  "agreement.created": "Agreement created",
  "agreement.revised": "Agreement revised",
  "agreement.signed": "Agreement signed",
  "agreement.executed": "Agreement executed",
  "agreement.cancelled": "Agreement cancelled",
  "escrow.funded": "Escrow funded",
  "milestone.created": "Milestone created",
  "milestone.delivered": "Milestone delivered",
  "milestone.approved": "Milestone approved",
  "milestone.rejected": "Milestone rejected",
  "invoice.paid": "Invoice paid",
  "dispute.opened": "Dispute opened",
  "dispute.resolved": "Dispute resolved",
  "settlement.completed": "Settlement completed",
};

export const SOURCE_PRODUCT_LABELS: Record<SourceProduct, string> = {
  ppv: "PPV",
  marketplace: "Gwap Marketplace",
  "daily-ideas": "Daily Ideas 2.0",
  dimi: "DIMI",
  gwapos: "GwapOS",
};

export const ROLE_LABELS: Record<ParticipantRole, string> = {
  creator: "Creator",
  buyer: "Buyer",
  seller: "Seller",
  payer: "Payer",
  payee: "Payee",
  collaborator: "Collaborator",
  arbiter: "Arbiter",
};

export function shortAddress(value: string, edge = 4) {
  return value.length > edge * 2 + 1 ? `${value.slice(0, edge)}…${value.slice(-edge)}` : value;
}

export function explorerTransactionUrl(signature: string) {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=${PPV_EXPLORER_CLUSTER}`;
}

export function explorerAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=${PPV_EXPLORER_CLUSTER}`;
}

export function formatCompletedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export function formatAmount(amount: string | null, mint: string | null) {
  if (!amount) return null;
  return mint ? `${amount} base units · ${shortAddress(mint)}` : `${amount} base units`;
}
