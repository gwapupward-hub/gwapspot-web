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
  "commit=5e4c8b43417e1b1ecda30ac7d811b262ff025079",
  "cluster=devnet",
].join("\n");

test("temporary signer is frozen to the exact Commerce release payload", () => {
  assert.equal(Buffer.byteLength(message, "utf8"), 161);
  assert.equal(
    createHash("sha256").update(message).digest("hex"),
    "3ed38583f6052d13bdff19227c8c46e67ac270db7a3cedfba33cef558b92aa3c",
  );
  for (const line of message.split("\n")) {
    assert.ok(signer.includes(line), "signer must contain every frozen payload line");
  }
  assert.ok(signer.includes("RELEASE_MESSAGE_BYTE_LENGTH = 161"));
  assert.ok(signer.includes("RELEASE_MESSAGE_SHA256"));
});

test("only the approved Core and Commerce Squads members may sign", () => {
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

test("page signs a message only and has no transaction or deployment path", () => {
  assert.ok(signer.includes('signMessage(RELEASE_MESSAGE_BYTES, "utf8")'));
  assert.ok(signer.includes("nacl.sign.detached.verify"));
  for (const forbidden of [
    "sendTransaction",
    "signTransaction",
    "signAllTransactions",
    "fetch(",
    "XMLHttpRequest",
  ]) {
    assert.equal(signer.includes(forbidden), false, `forbidden capability found: ${forbidden}`);
  }
});

test("release route bypasses the public splash and interaction layers", () => {
  assert.ok(layers.includes('pathname === "/ppv-commerce-approval"'));
});
