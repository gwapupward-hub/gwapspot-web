import "server-only";

import {
  appendClientReferenceId,
  createBillingReference,
  type PaidDeveloperPlan,
} from "../../lib/developer-billing-core";
import type { DeveloperPlan } from "../../lib/developer-api-core";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../lib/redis";

const CHECKOUT_INTENT_TTL_SECONDS = 24 * 60 * 60;
const PROCESSED_EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

export type DeveloperEntitlementStatus =
  | "free"
  | "active"
  | "past_due"
  | "canceled";

export type DeveloperEntitlement = {
  plan: DeveloperPlan;
  status: DeveloperEntitlementStatus;
  provider: "stripe" | null;
  subscriptionId: string | null;
  customerId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
};

type CheckoutIntent = {
  reference: string;
  ownerId: string;
  plan: PaidDeveloperPlan;
  createdAt: string;
};

type StripeCheckoutSession = {
  client_reference_id?: unknown;
  subscription?: unknown;
  customer?: unknown;
  mode?: unknown;
};

type StripeSubscription = {
  id?: unknown;
  customer?: unknown;
  status?: unknown;
  current_period_end?: unknown;
};

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: { object?: unknown };
};

function entitlementKey(ownerId: string) {
  return getPrivateStorageKey("developer-entitlement", ownerId);
}

function checkoutIntentKey(reference: string) {
  return getPrivateStorageKey("developer-billing-intent", reference);
}

function subscriptionOwnerKey(subscriptionId: string) {
  return getPrivateStorageKey("developer-subscription", subscriptionId);
}

function processedEventKey(eventId: string) {
  return getPrivateStorageKey("developer-billing-event", eventId);
}

function defaultEntitlement(): DeveloperEntitlement {
  return {
    plan: "developer",
    status: "free",
    provider: null,
    subscriptionId: null,
    customerId: null,
    currentPeriodEnd: null,
    updatedAt: new Date().toISOString(),
  };
}

function getPaymentLink(plan: PaidDeveloperPlan) {
  const value =
    plan === "growth"
      ? process.env.GWAP_STRIPE_GROWTH_PAYMENT_LINK
      : process.env.GWAP_STRIPE_SCALE_PAYMENT_LINK;
  return value?.trim() || null;
}

export function getDeveloperBillingConfiguration() {
  return {
    provider: "stripe" as const,
    webhookConfigured: Boolean(process.env.GWAP_STRIPE_WEBHOOK_SECRET?.trim()),
    checkoutAvailable: {
      growth: Boolean(getPaymentLink("growth")),
      scale: Boolean(getPaymentLink("scale")),
    },
  };
}

export async function getDeveloperEntitlement(ownerId: string) {
  const redis = getWorkspaceRedis();
  return (
    (await redis.get<DeveloperEntitlement>(entitlementKey(ownerId))) ||
    defaultEntitlement()
  );
}

export async function resolveDeveloperPlan(ownerId: string): Promise<DeveloperPlan> {
  const entitlement = await getDeveloperEntitlement(ownerId);
  if (
    entitlement.plan !== "developer" &&
    (entitlement.status === "active" || entitlement.status === "past_due")
  ) {
    return entitlement.plan;
  }
  return "developer";
}

export async function createDeveloperCheckout(
  ownerId: string,
  plan: PaidDeveloperPlan,
) {
  const paymentLink = getPaymentLink(plan);
  if (!paymentLink) throw new Error("BILLING_NOT_CONFIGURED");

  const reference = createBillingReference();
  const intent: CheckoutIntent = {
    reference,
    ownerId,
    plan,
    createdAt: new Date().toISOString(),
  };
  const redis = getWorkspaceRedis();
  await redis.set(checkoutIntentKey(reference), intent, {
    ex: CHECKOUT_INTENT_TTL_SECONDS,
  });

  return {
    plan,
    url: appendClientReferenceId(paymentLink, reference),
  };
}

async function activateCheckoutSession(session: StripeCheckoutSession) {
  if (session.mode !== "subscription") return "ignored" as const;
  const reference =
    typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  if (!reference || !subscriptionId) return "ignored" as const;

  const redis = getWorkspaceRedis();
  const intent = await redis.get<CheckoutIntent>(checkoutIntentKey(reference));
  if (!intent) return "ignored" as const;

  const entitlement: DeveloperEntitlement = {
    plan: intent.plan,
    status: "active",
    provider: "stripe",
    subscriptionId,
    customerId: typeof session.customer === "string" ? session.customer : null,
    currentPeriodEnd: null,
    updatedAt: new Date().toISOString(),
  };

  await Promise.all([
    redis.set(entitlementKey(intent.ownerId), entitlement),
    redis.set(subscriptionOwnerKey(subscriptionId), intent.ownerId),
  ]);
  return "applied" as const;
}

function periodEnd(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1_000).toISOString();
}

async function updateSubscription(
  subscription: StripeSubscription,
  deleted: boolean,
) {
  const subscriptionId = typeof subscription.id === "string" ? subscription.id : null;
  if (!subscriptionId) return "ignored" as const;

  const redis = getWorkspaceRedis();
  const ownerId = await redis.get<string>(subscriptionOwnerKey(subscriptionId));
  if (!ownerId) return "ignored" as const;
  const existing = await getDeveloperEntitlement(ownerId);

  const rawStatus = typeof subscription.status === "string" ? subscription.status : "";
  const shouldDowngrade =
    deleted ||
    rawStatus === "canceled" ||
    rawStatus === "unpaid" ||
    rawStatus === "incomplete_expired";

  const entitlement: DeveloperEntitlement = shouldDowngrade
    ? {
        plan: "developer",
        status: "canceled",
        provider: "stripe",
        subscriptionId,
        customerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : existing.customerId,
        currentPeriodEnd: periodEnd(subscription.current_period_end),
        updatedAt: new Date().toISOString(),
      }
    : {
        ...existing,
        status: rawStatus === "past_due" ? "past_due" : "active",
        provider: "stripe",
        subscriptionId,
        customerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : existing.customerId,
        currentPeriodEnd:
          periodEnd(subscription.current_period_end) ?? existing.currentPeriodEnd,
        updatedAt: new Date().toISOString(),
      };

  await redis.set(entitlementKey(ownerId), entitlement);
  return "applied" as const;
}

export async function applyStripeDeveloperBillingEvent(event: StripeEvent) {
  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : null;
  if (!eventId || !eventType || !event.data?.object) return "ignored" as const;

  const redis = getWorkspaceRedis();
  if (await redis.get<boolean>(processedEventKey(eventId))) return "duplicate" as const;

  let result: "applied" | "ignored" = "ignored";
  if (eventType === "checkout.session.completed") {
    result = await activateCheckoutSession(event.data.object as StripeCheckoutSession);
  } else if (eventType === "customer.subscription.updated") {
    result = await updateSubscription(event.data.object as StripeSubscription, false);
  } else if (eventType === "customer.subscription.deleted") {
    result = await updateSubscription(event.data.object as StripeSubscription, true);
  }

  await redis.set(processedEventKey(eventId), true, {
    ex: PROCESSED_EVENT_TTL_SECONDS,
  });
  return result;
}
