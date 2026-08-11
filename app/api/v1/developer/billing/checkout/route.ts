import { NextResponse } from "next/server";
import {
  createDeveloperCheckout,
  getDeveloperEntitlement,
} from "../../../../../app/lib/developer-billing";
import { isPaidDeveloperPlan } from "../../../../../lib/developer-billing-core";
import { getAuthenticatedWalletIdentity } from "../../../../../lib/privy-server";
import { checkRateLimit, hasValidOrigin } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...responseHeaders, ...headers },
  });
}

export async function POST(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  if (!hasValidOrigin(request)) return json({ error: "Invalid origin" }, 403);

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (!isPaidDeveloperPlan(body.plan)) {
    return json({ error: "Choose the Growth or Scale plan." }, 400);
  }

  try {
    const rate = await checkRateLimit(
      `developer-checkout:${identity.userId}`,
      10,
      60 * 60_000,
    );
    if (!rate.allowed) {
      return json(
        { error: "Too many checkout attempts. Try again later." },
        429,
        { "Retry-After": String(rate.retryAfter) },
      );
    }

    const entitlement = await getDeveloperEntitlement(identity.userId);
    if (
      entitlement.plan !== "developer" &&
      (entitlement.status === "active" || entitlement.status === "past_due")
    ) {
      return json(
        { error: "An active paid developer subscription already exists." },
        409,
      );
    }

    const checkout = await createDeveloperCheckout(identity.userId, body.plan);
    return json(checkout, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_NOT_CONFIGURED") {
      return json({ error: "Checkout is not configured for this plan yet." }, 503);
    }
    if (error instanceof Error && error.message === "BILLING_LINK_INVALID") {
      return json({ error: "The configured checkout link is invalid." }, 503);
    }
    if (error instanceof Error && error.message === "ACCOUNT_DELETION_PENDING") {
      return json(
        { error: "Checkout is unavailable while account deletion is pending." },
        409,
      );
    }
    return json({ error: "Developer checkout is temporarily unavailable." }, 503);
  }
}
