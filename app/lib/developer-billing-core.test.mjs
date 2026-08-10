import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  appendClientReferenceId,
  createBillingReference,
  isPaidDeveloperPlan,
  verifyStripeWebhookSignature,
} from "./developer-billing-core.ts";

test("billing references are opaque and Stripe-safe", () => {
  const reference = createBillingReference();
  assert.match(reference, /^gwap_[A-Za-z0-9_-]+$/);
  assert.ok(reference.length < 200);
});

test("payment links receive the checkout reconciliation reference", () => {
  const url = appendClientReferenceId(
    "https://buy.stripe.com/test?prefilled_email=dev%40example.com",
    "gwap_reference_123",
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("client_reference_id"), "gwap_reference_123");
  assert.equal(parsed.searchParams.get("prefilled_email"), "dev@example.com");
});

test("paid plan validation excludes the free developer tier", () => {
  assert.equal(isPaidDeveloperPlan("developer"), false);
  assert.equal(isPaidDeveloperPlan("growth"), true);
  assert.equal(isPaidDeveloperPlan("scale"), true);
  assert.equal(isPaidDeveloperPlan("enterprise"), false);
});

test("Stripe webhook signature verification accepts valid raw payload signatures", () => {
  const payload = '{"id":"evt_test","type":"checkout.session.completed"}';
  const secret = "whsec_test_secret";
  const timestamp = 1_786_338_000;
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  assert.equal(
    verifyStripeWebhookSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      secret,
      { nowSeconds: timestamp },
    ),
    true,
  );
});

test("Stripe webhook signature verification rejects tampered or stale payloads", () => {
  const payload = '{"id":"evt_test"}';
  const secret = "whsec_test_secret";
  const timestamp = 1_786_338_000;
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  assert.equal(
    verifyStripeWebhookSignature(
      `${payload} `,
      `t=${timestamp},v1=${signature}`,
      secret,
      { nowSeconds: timestamp },
    ),
    false,
  );
  assert.equal(
    verifyStripeWebhookSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      secret,
      { nowSeconds: timestamp + 301 },
    ),
    false,
  );
});
