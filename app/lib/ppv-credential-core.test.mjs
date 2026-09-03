import assert from "node:assert/strict";
import test from "node:test";
import { signMintAuthorization, verifyMintAuthorization, hashCredentialMetadata } from "./ppv-credential-core.ts";
import { PROOF_PDA, WALLET_A } from "./ppv-reputation-test-fixtures.mjs";

const SECRET = "s".repeat(48);
const metadata = {
  schemaVersion: 1,
  name: "PPV Receipt · settlement.completed",
  symbol: "PPV",
  description: "d",
  ppv_proof_id: PROOF_PDA,
  receipt_id: "rcpt_" + "a".repeat(40),
  holder_wallet: WALLET_A,
  holder_gns_record: null,
  role: "payee",
  source_product: "marketplace",
  event_type: "settlement.completed",
  completion_date: "2026-01-05T00:00:00.000Z",
  seal_state: "settled",
  verification_uri: "https://www.gwapspot.com/receipt/x",
};

test("mint authorizations bind receipt, holder and exact metadata, and expire", () => {
  const now = new Date("2026-01-06T00:00:00.000Z");
  const auth = signMintAuthorization({ receiptId: metadata.receipt_id, holderWallet: WALLET_A, metadata }, SECRET, now);
  const expected = { receiptId: metadata.receipt_id, holderWallet: WALLET_A, metadata };
  assert.equal(verifyMintAuthorization(auth, expected, SECRET, now), true);
  assert.equal(verifyMintAuthorization(auth, { ...expected, holderWallet: PROOF_PDA }, SECRET, now), false);
  assert.equal(verifyMintAuthorization(auth, { ...expected, metadata: { ...metadata, role: "payer" } }, SECRET, now), false);
  assert.equal(verifyMintAuthorization({ ...auth, signature: auth.signature.replace(/^./, "0") }, expected, SECRET, now), false);
  assert.equal(verifyMintAuthorization(auth, expected, "t".repeat(48), now), false);
  assert.equal(verifyMintAuthorization(auth, expected, SECRET, new Date(now.getTime() + 16 * 60_000)), false);
  assert.equal(hashCredentialMetadata(metadata), hashCredentialMetadata({ ...metadata }));
  assert.throws(() => signMintAuthorization({ receiptId: "r", holderWallet: WALLET_A, metadata }, "short"), /secret/);
});
