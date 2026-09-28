import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const signer = readFileSync(
  new URL("./commerce-approval-signer.tsx", import.meta.url),
  "utf8",
);
const layers = readFileSync(
  new URL("../components/public-experience-layers.tsx", import.meta.url),
  "utf8",
);

const message = [
  "PPV_DEVNET_RELEASE_V1",
  "program=ppv_commerce",
  "program_id=GmRDoFuPrBrsxnvTX751WK5rLu14JXe4sgjh6vNwHzr3",
  "commit=83b5e8843b5492f4c1b596cb5d4be5d997eb87e4",
  "cluster=devnet",
].join("\n");

test("temporary signer is frozen to the exact Commerce 83b5e884 payload", () => {
  assert.equal(Buffer.byteLength(message, "utf8"), 161);
  assert.equal(
    createHash("sha256").update(message).digest("hex"),
    "3eb395f68a6f6aec1f46666b36194e28fc06e14fc1b27631a9b12102b665de33",
  );
  for (const line of message.split("\n")) {
    assert.ok(signer.includes(line), "signer must contain every frozen payload line");
  }
  assert.ok(signer.includes("RELEASE_MESSAGE_BYTE_LENGTH = 161"));
  assert.ok(signer.includes("3eb395f68a6f6aec1f46666b36194e28fc06e14fc1b27631a9b12102b665de33"));
});

test("only approved PPV Squads members may sign", () => {
  for (const member of [
    "58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV",
    "2FFVcm9xJmUHG6zfo15ktzuGQTXACPG42iquGHe6faTN",
    "BJmFM4k7Q32CiCYSdoYkAhXdD5Sk3BegMh2cbEAsgSwJ",
  ]) {
    assert.ok(signer.includes(member));
  }
  assert.ok(signer.includes("APPROVED_MEMBERS.has(wallet)"));
  assert.ok(signer.includes("APPROVED_MEMBERS.has(signedWallet)"));
});

test("page signs only the frozen message and cannot submit transactions", () => {
  assert.ok(signer.includes('signMessage(RELEASE_MESSAGE_BYTES, "utf8")'));
  assert.ok(signer.includes("nacl.sign.detached.verify"));
  for (const forbidden of [
    "sendTransaction",
    "signTransaction",
    "signAllTransactions",
    "XMLHttpRequest",
  ]) {
    assert.equal(
      signer.includes(forbidden),
      false,
      `forbidden capability found: ${forbidden}`,
    );
  }
});

test("new approval route bypasses public splash and interaction layers", () => {
  assert.ok(layers.includes('pathname === "/ppv-commerce-approval-83b5e884"'));
});
