import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../app/ppv/proofs/proof-actions.tsx", import.meta.url),
  "utf8",
);

test("PPV proof UI names the external-wallet devnet requirement", () => {
  assert.match(source, /PPV NETWORK: SOLANA DEVNET/);
  assert.match(source, /Settings → Developer Settings → Testnet Mode → Solana Devnet/);
  assert.match(source, /only the PPV transaction network must be devnet/);
});

test("PPV signing copy warns Phantom users before wallet approval", () => {
  assert.match(
    source,
    /Phantom users must have Testnet Mode set to Solana Devnet before approving/,
  );
});
