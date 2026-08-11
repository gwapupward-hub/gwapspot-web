import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DeveloperPlan } from "./developer-api-core";

export type PaidDeveloperPlan = Exclude<DeveloperPlan, "developer">;

export type StripeBillingEventType =
  | "checkout.session.completed"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

export type BillingEventCursor = {
  id: string;
  created: number;
  priority: number;
};

const EVENT_PRIORITY: Record<StripeBillingEventType, number> = {
  "checkout.session.completed": 10,
  "customer.subscription.updated": 20,
  "customer.subscription.deleted": 30,
};

export function isPaidDeveloperPlan(value: unknown): value is PaidDeveloperPlan {
  return value === "growth" || value === "scale";
}

export function createBillingReference() {
  return `gwap_${randomBytes(18).toString("base64url")}`;
}

export function appendClientReferenceId(paymentLink: string, reference: string) {
  const url = new URL(paymentLink);
  if (url.protocol !== "https:") throw new Error("BILLING_LINK_INVALID");
  url.searchParams.set("client_reference_id", reference);
  return url.toString();
}

export function createBillingEventCursor(
  id: string,
  type: StripeBillingEventType,
  created: unknown,
): BillingEventCursor | null {
  if (!id || typeof created !== "number" || !Number.isInteger(created) || created <= 0) {
    return null;
  }
  return { id, created, priority: EVENT_PRIORITY[type] };
}

export function shouldApplyBillingEvent(
  current: BillingEventCursor | null | undefined,
  incoming: BillingEventCursor,
) {
  if (!current) return true;
  if (incoming.created !== current.created) {
    return incoming.created > current.created;
  }
  if (incoming.priority !== current.priority) {
    return incoming.priority > current.priority;
  }
  if (incoming.id === current.id) return false;

  // Stripe timestamps have one-second precision. Use the event ID only as a
  // deterministic tie-breaker for two different same-type events in one second.
  return incoming.id > current.id;
}

function parseStripeSignature(header: string) {
  const parts = header.split(",").map((part) => part.trim());
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === "t") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === "v1" && /^[a-f0-9]{64}$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }

  return { timestamp, signatures };
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  options: { nowSeconds?: number; toleranceSeconds?: number } = {},
) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0 || !secret) return false;

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const toleranceSeconds = options.toleranceSeconds ?? 300;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest();

  return signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
