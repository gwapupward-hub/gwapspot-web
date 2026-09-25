import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(
  new URL("./commerce.server.ts", import.meta.url),
  "utf8",
);
const ledger = readFileSync(
  new URL("./commerce-operation.server.ts", import.meta.url),
  "utf8",
);
const prepareRoute = readFileSync(
  new URL("../../api/ppv/commerce/prepare/route.ts", import.meta.url),
  "utf8",
);
const confirmRoute = readFileSync(
  new URL("../../api/ppv/commerce/confirm/route.ts", import.meta.url),
  "utf8",
);
const readRoute = readFileSync(
  new URL("../../api/ppv/commerce/agreement/route.ts", import.meta.url),
  "utf8",
);

test("Commerce service uses canonical SDK builders and canonical PDA derivation", () => {
  assert.match(server, /buildCreateCommerceAgreementInstruction/);
  assert.match(server, /buildReviseCommerceAgreementInstruction/);
  assert.match(server, /buildSignCommerceAgreementInstruction/);
  assert.match(server, /buildCancelCommerceAgreementInstruction/);
  assert.match(server, /deriveCommerceAgreement/);
  assert.match(server, /decodeAgreement/);
});

test("Commerce mutations are independently gated and finalized-only", () => {
  assert.match(server, /requirePpvMutationReadiness\(\["commerce"\]\)/);
  assert.match(server, /getParsedTransaction\(signature, \{\s*commitment: "finalized"/);
  assert.match(server, /getAccountInfo\([^)]*agreement[^)]*, "finalized"\)/);
  assert.match(server, /getLatestBlockhash\("finalized"\)/);
  assert.match(server, /getFeeForMessage\([^,]+, "finalized"\)/);
  assert.match(server, /getMinimumBalanceForRentExemption/);
  assert.match(server, /AGREEMENT_ACCOUNT_BYTES = 473/);
});

test("Commerce create and signing inputs are derived from authenticated wallet authority", () => {
  assert.match(prepareRoute, /authority: identity\.verifiedWallet/);
  assert.doesNotMatch(prepareRoute, /authority: payload\./);
  assert.match(confirmRoute, /authority: identity\.verifiedWallet/);
  assert.match(readRoute, /authority: identity\.verifiedWallet/);
});

test("Commerce confirmation trusts the durable operation rather than caller-supplied agreement state", () => {
  assert.match(confirmRoute, /typeof payload\.operationId !== "string"/);
  assert.match(confirmRoute, /typeof payload\.signature !== "string"/);
  assert.doesNotMatch(confirmRoute, /payload\.contentHashHex/);
  assert.doesNotMatch(confirmRoute, /payload\.termsHashHex/);
  assert.doesNotMatch(confirmRoute, /payload\.expectedVersion/);
  assert.match(ledger, /ppv-commerce-operation/);
  assert.match(ledger, /ppv-commerce-intent/);
  assert.match(ledger, /setIfAbsent\(/);
  assert.match(ledger, /OPERATION_SIGNATURE_MISMATCH/);
});

test("Commerce service validates current state before revise/sign/cancel", () => {
  assert.match(server, /assertParty\(current\.record, authority\)/);
  assert.match(server, /assertPending\(current\.record\)/);
  assert.match(server, /assertExpectedVersion\(current\.record, input\.expectedVersion\)/);
  assert.match(server, /AGREEMENT_HASH_MISMATCH/);
  assert.match(server, /ALREADY_SIGNED/);
  assert.match(server, /NO_CHANGES/);
});

test("Commerce read endpoint only returns records to an authenticated agreement party", () => {
  assert.match(server, /assertParty\(record, authority\)/);
  assert.match(readRoute, /getAuthenticatedWalletIdentityResult/);
  assert.match(readRoute, /hasValidOrigin/);
});
