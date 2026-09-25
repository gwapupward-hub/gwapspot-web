import assert from "node:assert/strict";
import test from "node:test";
import {
  CommerceEscrowBindingError,
  assertCommerceEscrowBinding,
} from "./commerce-binding.ts";

const HASH_A = "aa".repeat(32);
const HASH_B = "bb".repeat(32);
const SCHEDULE = "cc".repeat(32);

const agreement = {
  state: "executed",
  version: 2,
  partyA: "Buyer111111111111111111111111111111111111",
  partyB: "Seller11111111111111111111111111111111111",
  contentHash: HASH_A,
  termsHash: HASH_B,
};

const reviewedTerms = {
  buyerWallet: agreement.partyA,
  sellerWallet: agreement.partyB,
  mint: "Mint1111111111111111111111111111111111111",
  amountBaseUnits: "2500000",
  scheduleHash: SCHEDULE,
};

const escrow = { ...reviewedTerms };

function throwsCode(code, mutate) {
  assert.throws(
    () =>
      assertCommerceEscrowBinding({
        agreement: mutate?.agreement ?? agreement,
        reviewedContentHash: mutate?.reviewedContentHash ?? HASH_A,
        reviewedTermsHash: mutate?.reviewedTermsHash ?? HASH_B,
        reviewedTerms: mutate?.reviewedTerms ?? reviewedTerms,
        escrow: mutate?.escrow ?? escrow,
      }),
    (error) => error instanceof CommerceEscrowBindingError && error.code === code,
  );
}

test("executed Commerce agreement can bind to an exact Escrow draft", () => {
  const result = assertCommerceEscrowBinding({
    agreement,
    reviewedContentHash: HASH_A,
    reviewedTermsHash: HASH_B,
    reviewedTerms,
    escrow,
  });
  assert.equal(result.ok, true);
  assert.equal(result.agreementVersion, 2);
  assert.equal(result.amountBaseUnits, "2500000");
});

test("binding rejects stale or unexecuted Commerce state", () => {
  throwsCode("COMMERCE_NOT_EXECUTED", {
    agreement: { ...agreement, state: "pending" },
  });
  throwsCode("CONTENT_HASH_MISMATCH", { reviewedContentHash: "dd".repeat(32) });
  throwsCode("TERMS_HASH_MISMATCH", { reviewedTermsHash: "ee".repeat(32) });
});

test("binding rejects role substitution", () => {
  throwsCode("BUYER_ROLE_MISMATCH", {
    reviewedTerms: { ...reviewedTerms, buyerWallet: "OtherBuyer" },
  });
  throwsCode("SELLER_ROLE_MISMATCH", {
    reviewedTerms: { ...reviewedTerms, sellerWallet: "OtherSeller" },
  });
});

test("binding rejects Escrow amount, mint and schedule drift", () => {
  throwsCode("ESCROW_AMOUNT_MISMATCH", {
    escrow: { ...escrow, amountBaseUnits: "2500001" },
  });
  throwsCode("ESCROW_MINT_MISMATCH", {
    escrow: { ...escrow, mint: "DifferentMint" },
  });
  throwsCode("ESCROW_SCHEDULE_MISMATCH", {
    escrow: { ...escrow, scheduleHash: "ff".repeat(32) },
  });
});

test("binding rejects non-integer base-unit amounts", () => {
  throwsCode("INVALID_AMOUNT", {
    escrow: { ...escrow, amountBaseUnits: "2.5" },
  });
});
