import "server-only";

import {
  appendClientReferenceId,
  createBillingEventCursor,
  createBillingReference,
  shouldApplyBillingEvent,
  type BillingEventCursor,
  type PaidDeveloperPlan,
  type StripeBillingEventType,
} from "../../lib/developer-billing-core";
import type { DeveloperPlan } from "../../lib/developer-api-core";
import { getPrivateStorageKey, getWorkspaceRedis } from "../../lib/redis";
import { withWorkspaceLock } from "../../lib/workspace-lock";

const CHECKOUT_INTENT_TTL_SECONDS = 24 * 60 * 60;
const DELETED_OWNER_TTL_SECONDS = CHECKOUT_INTENT_TTL_SECONDS + 60 * 60;
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

type StoredDeveloperEntitlement = DeveloperEntitlement & {
  billingEvent: BillingEventCursor | null;
};

type CheckoutIntent = {
  reference: string;
  ownerId: string;
  plan: PaidDeveloperPlan;
  createdAt: string;
};

type CheckoutOwnerState = {
  reference: string;
};

type PendingSubscriptionEvent = {
  subscription: StripeSubscription;
  deleted: boolean;
  billingEvent: BillingEventCursor;
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
  created?: unknown;
  data?: { object?: unknown };
};

function entitlementKey(ownerId: string) {
  return getPrivateStorageKey("developer-entitlement", ownerId);
}

function checkoutIntentKey(reference: string) {
  return getPrivateStorageKey("developer-billing-intent", reference);
}

function checkoutOwnerStateKey(ownerId: string) {
  return getPrivateStorageKey("developer-billing-owner", ownerId);
}

function subscriptionOwnerKey(subscriptionId: string) {
  return getPrivateStorageKey("developer-subscription", subscriptionId);
}

function pendingSubscriptionEventKey(subscriptionId: string) {
  return getPrivateStorageKey("developer-subscription-pending", subscriptionId);
}

function processedEventKey(eventId: string) {
  return getPrivateStorageKey("developer-billing-event", eventId);
}

function deletedOwnerKey(ownerId: string) {
  return getPrivateStorageKey("developer-deleted-owner", ownerId);
}

function billingLockKey(ownerId: string) {
  return getPrivateStorageKey("developer-billing-lock", ownerId);
}

function subscriptionLockKey(subscriptionId: string) {
  return getPrivateStorageKey("developer-subscription-lock", subscriptionId);
}

function defaultStoredEntitlement(): StoredDeveloperEntitlement {
  return {
    plan: "developer",
    status: "free",
    provider: null,
    subscriptionId: null,
    customerId: null,
    currentPeriodEnd: null,
    updatedAt: new Date().toISOString(),
    billingEvent: null,
  };
}

function publicEntitlement(
  entitlement: StoredDeveloperEntitlement,
): DeveloperEntitlement {
  return {
    plan: entitlement.plan,
    status: entitlement.status,
    provider: entitlement.provider,
    subscriptionId: entitlement.subscriptionId,
    customerId: entitlement.customerId,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    updatedAt: entitlement.updatedAt,
  };
}

async function readStoredEntitlement(ownerId: string) {
  const redis = getWorkspaceRedis();
  const stored = await redis.get<
    DeveloperEntitlement & { billingEvent?: BillingEventCursor | null }
  >(entitlementKey(ownerId));
  if (!stored) return defaultStoredEntitlement();
  return { ...stored, billingEvent: stored.billingEvent ?? null };
}

function getPaymentLink(plan: PaidDeveloperPlan) {
  const value =
    plan === "growth"
      ? process.env.GWAP_STRIPE_GROWTH_PAYMENT_LINK
      : process.env.GWAP_STRIPE_SCALE_PAYMENT_LINK;
  return value?.trim() || null;
}

function isSupportedEventType(value: string): value is StripeBillingEventType {
  return (
    value === "checkout.session.completed" ||
    value === "customer.subscription.updated" ||
    value === "customer.subscription.deleted"
  );
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
  return publicEntitlement(await readStoredEntitlement(ownerId));
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

  const redis = getWorkspaceRedis();
  return withWorkspaceLock(redis, billingLockKey(ownerId), async () => {
    if (await redis.get<boolean>(deletedOwnerKey(ownerId))) {
      throw new Error("ACCOUNT_DELETION_PENDING");
    }

    const previous = await redis.get<CheckoutOwnerState>(
      checkoutOwnerStateKey(ownerId),
    );
    const reference = createBillingReference();
    const intent: CheckoutIntent = {
      reference,
      ownerId,
      plan,
      createdAt: new Date().toISOString(),
    };

    await redis.set(checkoutIntentKey(reference), intent, {
      ex: CHECKOUT_INTENT_TTL_SECONDS,
    });
    try {
      await redis.set(
        checkoutOwnerStateKey(ownerId),
        { reference } satisfies CheckoutOwnerState,
        { ex: CHECKOUT_INTENT_TTL_SECONDS },
      );
    } catch (error) {
      await redis.del(checkoutIntentKey(reference)).catch(() => 0);
      throw error;
    }

    if (previous && previous.reference !== reference) {
      await redis.del(checkoutIntentKey(previous.reference));
    }

    return {
      plan,
      url: appendClientReferenceId(paymentLink, reference),
    };
  });
}

async function activateCheckoutSession(
  session: StripeCheckoutSession,
  billingEvent: BillingEventCursor,
) {
  if (session.mode !== "subscription") return "ignored" as const;
  const reference =
    typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  if (!reference || !subscriptionId) return "ignored" as const;

  const redis = getWorkspaceRedis();
  const initialIntent = await redis.get<CheckoutIntent>(checkoutIntentKey(reference));
  if (!initialIntent) return "ignored" as const;

  return withWorkspaceLock(
    redis,
    subscriptionLockKey(subscriptionId),
    () =>
      withWorkspaceLock(
        redis,
        billingLockKey(initialIntent.ownerId),
        async () => {
          const intent = await redis.get<CheckoutIntent>(checkoutIntentKey(reference));
          if (!intent || intent.ownerId !== initialIntent.ownerId) {
            return "ignored" as const;
          }
          if (await redis.get<boolean>(deletedOwnerKey(intent.ownerId))) {
            await redis.del(checkoutIntentKey(reference));
            const ownerState = await redis.get<CheckoutOwnerState>(
              checkoutOwnerStateKey(intent.ownerId),
            );
            if (ownerState?.reference === reference) {
              await redis.del(checkoutOwnerStateKey(intent.ownerId));
            }
            return "ignored" as const;
          }

          const existing = await readStoredEntitlement(intent.ownerId);
          if (!shouldApplyBillingEvent(existing.billingEvent, billingEvent)) {
            return "ignored" as const;
          }

          let entitlement: StoredDeveloperEntitlement = {
            plan: intent.plan,
            status: "active",
            provider: "stripe",
            subscriptionId,
            customerId:
              typeof session.customer === "string" ? session.customer : null,
            currentPeriodEnd: null,
            updatedAt: new Date().toISOString(),
            billingEvent,
          };

          // Store the reverse lookup first. If the entitlement write fails, a
          // retry can still resolve the owner and repeat the transition.
          await redis.set(subscriptionOwnerKey(subscriptionId), intent.ownerId);
          const pending = await redis.get<PendingSubscriptionEvent>(
            pendingSubscriptionEventKey(subscriptionId),
          );
          if (
            pending &&
            shouldApplyBillingEvent(
              entitlement.billingEvent,
              pending.billingEvent,
            )
          ) {
            entitlement = buildSubscriptionEntitlement(
              entitlement,
              pending.subscription,
              pending.deleted,
              pending.billingEvent,
              subscriptionId,
            );
          }
          await redis.set(entitlementKey(intent.ownerId), entitlement);
          if (pending) {
            await redis.del(pendingSubscriptionEventKey(subscriptionId));
          }
          await redis.del(checkoutIntentKey(reference));
          const ownerState = await redis.get<CheckoutOwnerState>(
            checkoutOwnerStateKey(intent.ownerId),
          );
          if (ownerState?.reference === reference) {
            await redis.del(checkoutOwnerStateKey(intent.ownerId));
          }
          return "applied" as const;
        },
      ),
  );
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
  billingEvent: BillingEventCursor,
) {
  const subscriptionId =
    typeof subscription.id === "string" ? subscription.id : null;
  if (!subscriptionId) return "ignored" as const;

  const redis = getWorkspaceRedis();
  return withWorkspaceLock(redis, subscriptionLockKey(subscriptionId), async () => {
    const ownerId = await redis.get<string>(subscriptionOwnerKey(subscriptionId));
    if (!ownerId) {
      const pendingKey = pendingSubscriptionEventKey(subscriptionId);
      const pending = await redis.get<PendingSubscriptionEvent>(pendingKey);
      if (
        pending &&
        !shouldApplyBillingEvent(pending.billingEvent, billingEvent)
      ) {
        return "ignored" as const;
      }
      await redis.set(
        pendingKey,
        { subscription, deleted, billingEvent } satisfies PendingSubscriptionEvent,
        { ex: PROCESSED_EVENT_TTL_SECONDS },
      );
      return "deferred" as const;
    }

    return withWorkspaceLock(redis, billingLockKey(ownerId), async () => {
      if (await redis.get<boolean>(deletedOwnerKey(ownerId))) {
        await redis.del(subscriptionOwnerKey(subscriptionId));
        return "ignored" as const;
      }

      const existing = await readStoredEntitlement(ownerId);
      if (!shouldApplyBillingEvent(existing.billingEvent, billingEvent)) {
        return "ignored" as const;
      }

      const entitlement = buildSubscriptionEntitlement(
        existing,
        subscription,
        deleted,
        billingEvent,
        subscriptionId,
      );
      await redis.set(entitlementKey(ownerId), entitlement);
      return "applied" as const;
    });
  });
}

function buildSubscriptionEntitlement(
  existing: StoredDeveloperEntitlement,
  subscription: StripeSubscription,
  deleted: boolean,
  billingEvent: BillingEventCursor,
  subscriptionId: string,
): StoredDeveloperEntitlement {
  const rawStatus =
    typeof subscription.status === "string" ? subscription.status : "";
  const shouldDowngrade =
    deleted ||
    rawStatus === "canceled" ||
    rawStatus === "unpaid" ||
    rawStatus === "incomplete_expired";

  return shouldDowngrade
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
        billingEvent,
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
        billingEvent,
      };
}

export async function applyStripeDeveloperBillingEvent(event: StripeEvent) {
  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : null;
  if (!eventId || !eventType || !event.data?.object) return "ignored" as const;

  const redis = getWorkspaceRedis();
  if (await redis.get<boolean>(processedEventKey(eventId))) {
    return "duplicate" as const;
  }

  let result: "applied" | "deferred" | "ignored" = "ignored";
  if (isSupportedEventType(eventType)) {
    const billingEvent = createBillingEventCursor(
      eventId,
      eventType,
      event.created,
    );
    if (billingEvent) {
      if (eventType === "checkout.session.completed") {
        result = await activateCheckoutSession(
          event.data.object as StripeCheckoutSession,
          billingEvent,
        );
      } else if (eventType === "customer.subscription.updated") {
        result = await updateSubscription(
          event.data.object as StripeSubscription,
          false,
          billingEvent,
        );
      } else {
        result = await updateSubscription(
          event.data.object as StripeSubscription,
          true,
          billingEvent,
        );
      }
    }
  }

  await redis.set(processedEventKey(eventId), true, {
    ex: PROCESSED_EVENT_TTL_SECONDS,
  });
  return result;
}

export async function deleteDeveloperBillingAccount(ownerId: string) {
  const redis = getWorkspaceRedis();
  return withWorkspaceLock(redis, billingLockKey(ownerId), async () => {
    const entitlement = await readStoredEntitlement(ownerId);
    if (
      entitlement.plan !== "developer" &&
      (entitlement.status === "active" || entitlement.status === "past_due")
    ) {
      throw new Error("ACTIVE_DEVELOPER_SUBSCRIPTION");
    }

    const ownerState = await redis.get<CheckoutOwnerState>(
      checkoutOwnerStateKey(ownerId),
    );
    await redis.set(deletedOwnerKey(ownerId), true, {
      ex: DELETED_OWNER_TTL_SECONDS,
    });

    const relatedKeys = [
      ...(entitlement.subscriptionId
        ? [subscriptionOwnerKey(entitlement.subscriptionId)]
        : []),
      ...(ownerState ? [checkoutIntentKey(ownerState.reference)] : []),
    ];
    await Promise.all(relatedKeys.map((key) => redis.del(key)));
    await redis.del(entitlementKey(ownerId));
    await redis.del(checkoutOwnerStateKey(ownerId));
  });
}
