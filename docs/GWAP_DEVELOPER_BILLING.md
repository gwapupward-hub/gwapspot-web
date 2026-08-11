# GWAP Developer Billing

Sprint 5 uses Stripe Payment Links for checkout while GWAP keeps the developer entitlement record in Redis.

## Required environment variables

```text
GWAP_STRIPE_GROWTH_PAYMENT_LINK=https://buy.stripe.com/...
GWAP_STRIPE_SCALE_PAYMENT_LINK=https://buy.stripe.com/...
GWAP_STRIPE_WEBHOOK_SECRET=whsec_...
```

No Stripe secret API key is required for this first billing slice.

## Stripe configuration

1. Create one recurring Payment Link for the Growth developer subscription.
2. Create one recurring Payment Link for the Scale developer subscription.
3. Put the two Payment Link URLs in the matching Vercel environment variables.
4. Create a Stripe webhook endpoint pointing to:

   `https://www.gwapspot.com/api/v1/developer/billing/webhook`

5. Subscribe the endpoint to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Put the webhook signing secret in `GWAP_STRIPE_WEBHOOK_SECRET`.
7. Redeploy after changing Vercel environment variables.

## Entitlement flow

1. Authenticated developer chooses Growth or Scale in GwapOS.
2. GWAP creates an opaque, short-lived checkout reference in Redis.
3. GWAP appends that reference as Stripe `client_reference_id` and redirects to the configured Payment Link.
4. Stripe sends `checkout.session.completed` to the signed webhook.
5. GWAP resolves the checkout reference, stores the subscription mapping, and activates the paid plan.
6. B2B API authorization resolves the account entitlement on every request, so existing API keys receive the new quota automatically.
7. Subscription deletion or terminal unpaid/canceled states return the account to the Developer quota.

## Important boundaries

- Prices are controlled in Stripe, not hard-coded in the repository.
- Monthly quota is account-wide across all API keys.
- Per-minute burst protection remains per API key.
- A paid developer cannot start a second paid checkout while an active/past-due subscription exists. Paid plan changes/customer portal support belong in the next billing expansion.
- Account deletion is blocked while a paid subscription is active or past due; deleting only GWAP's local entitlement would not cancel Stripe billing.
- Webhook signature verification uses the raw request body and `Stripe-Signature` header before JSON parsing.
- Supported webhook events are serialized per owner and compared by Stripe event timestamp, with terminal subscription events taking precedence over checkout activation in same-second races.
