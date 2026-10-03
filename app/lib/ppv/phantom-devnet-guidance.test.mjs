import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../app/ppv/proofs/proof-actions.tsx", import.meta.url),
  "utf8",
);

test("PPV proof UI distinguishes embedded and external-wallet devnet handling", () => {
  assert.match(source, /PPV NETWORK: SOLANA DEVNET/);
  assert.match(source, /embedded GWAP Wallet is routed to Solana Devnet/);
  assert.match(
    source,
    /External wallets must be connected in their devnet\/testnet context before approving/,
  );
  assert.match(source, /only the PPV transaction network must be devnet/);
});

test("PPV signing copy names the verified Solana wallet before approval", () => {
  assert.match(
    source,
    /Approve the PPV Core proof transaction in your verified Solana wallet/,
  );
  assert.match(
    source,
    /Approve the PPV Core revocation transaction in your verified Solana wallet/,
  );
});
