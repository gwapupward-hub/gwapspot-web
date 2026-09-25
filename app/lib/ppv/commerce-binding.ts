export type CommerceAgreementBindingRecord = Readonly<{
  state: "pending" | "executed" | "cancelled";
  version: number;
  partyA: string;
  partyB: string;
  contentHash: string;
  termsHash: string;
}>;

export type CommerceEscrowTermsSnapshot = Readonly<{
  buyerWallet: string;
  sellerWallet: string;
  mint: string;
  amountBaseUnits: string;
  scheduleHash: string;
}>;

export type EscrowBindingDraft = Readonly<{
  buyerWallet: string;
  sellerWallet: string;
  mint: string;
  amountBaseUnits: string;
  scheduleHash: string;
}>;

export type CommerceEscrowBindingErrorCode =
  | "COMMERCE_NOT_EXECUTED"
  | "CONTENT_HASH_MISMATCH"
  | "TERMS_HASH_MISMATCH"
  | "BUYER_ROLE_MISMATCH"
  | "SELLER_ROLE_MISMATCH"
  | "ESCROW_BUYER_MISMATCH"
  | "ESCROW_SELLER_MISMATCH"
  | "ESCROW_MINT_MISMATCH"
  | "ESCROW_AMOUNT_MISMATCH"
  | "ESCROW_SCHEDULE_MISMATCH"
  | "INVALID_AMOUNT";

export class CommerceEscrowBindingError extends Error {
  readonly code: CommerceEscrowBindingErrorCode;

  constructor(code: CommerceEscrowBindingErrorCode) {
    super(code);
    this.name = "CommerceEscrowBindingError";
    this.code = code;
  }
}

function sameHex(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function requireAmount(value: string) {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new CommerceEscrowBindingError("INVALID_AMOUNT");
  }
}

export function assertCommerceEscrowBinding(input: {
  agreement: CommerceAgreementBindingRecord;
  reviewedContentHash: string;
  reviewedTermsHash: string;
  reviewedTerms: CommerceEscrowTermsSnapshot;
  escrow: EscrowBindingDraft;
}) {
  const { agreement, reviewedContentHash, reviewedTermsHash, reviewedTerms, escrow } = input;

  if (agreement.state !== "executed") {
    throw new CommerceEscrowBindingError("COMMERCE_NOT_EXECUTED");
  }
  if (!sameHex(agreement.contentHash, reviewedContentHash)) {
    throw new CommerceEscrowBindingError("CONTENT_HASH_MISMATCH");
  }
  if (!sameHex(agreement.termsHash, reviewedTermsHash)) {
    throw new CommerceEscrowBindingError("TERMS_HASH_MISMATCH");
  }

  if (agreement.partyA !== reviewedTerms.buyerWallet) {
    throw new CommerceEscrowBindingError("BUYER_ROLE_MISMATCH");
  }
  if (agreement.partyB !== reviewedTerms.sellerWallet) {
    throw new CommerceEscrowBindingError("SELLER_ROLE_MISMATCH");
  }

  requireAmount(reviewedTerms.amountBaseUnits);
  requireAmount(escrow.amountBaseUnits);

  if (escrow.buyerWallet !== reviewedTerms.buyerWallet) {
    throw new CommerceEscrowBindingError("ESCROW_BUYER_MISMATCH");
  }
  if (escrow.sellerWallet !== reviewedTerms.sellerWallet) {
    throw new CommerceEscrowBindingError("ESCROW_SELLER_MISMATCH");
  }
  if (escrow.mint !== reviewedTerms.mint) {
    throw new CommerceEscrowBindingError("ESCROW_MINT_MISMATCH");
  }
  if (escrow.amountBaseUnits !== reviewedTerms.amountBaseUnits) {
    throw new CommerceEscrowBindingError("ESCROW_AMOUNT_MISMATCH");
  }
  if (!sameHex(escrow.scheduleHash, reviewedTerms.scheduleHash)) {
    throw new CommerceEscrowBindingError("ESCROW_SCHEDULE_MISMATCH");
  }

  return {
    ok: true as const,
    agreementVersion: agreement.version,
    buyerWallet: reviewedTerms.buyerWallet,
    sellerWallet: reviewedTerms.sellerWallet,
    mint: reviewedTerms.mint,
    amountBaseUnits: reviewedTerms.amountBaseUnits,
    scheduleHash: reviewedTerms.scheduleHash.toLowerCase(),
  };
}
