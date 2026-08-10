import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DeveloperPlan } from "./developer-api-core";

export type PaidDeveloperPlan = Exclude<DeveloperPlan, "developer">;

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
