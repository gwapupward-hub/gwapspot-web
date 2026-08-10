import { NextResponse } from "next/server";
import { applyStripeDeveloperBillingEvent } from "../../../../../app/lib/developer-billing";
import { verifyStripeWebhookSignature } from "../../../../../lib/developer-billing-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

export async function POST(request: Request) {
  const secret = process.env.GWAP_STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Billing webhook is not configured." },
      { status: 503, headers: responseHeaders },
    );
  }

  const signature = request.headers.get("stripe-signature")?.trim();
  const payload = await request.text();
  if (!signature || !verifyStripeWebhookSignature(payload, signature, secret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400, headers: responseHeaders },
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const result = await applyStripeDeveloperBillingEvent(
      event as Parameters<typeof applyStripeDeveloperBillingEvent>[0],
    );
    return NextResponse.json({ received: true, result }, { headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { error: "Billing event processing failed." },
      { status: 503, headers: responseHeaders },
    );
  }
}
