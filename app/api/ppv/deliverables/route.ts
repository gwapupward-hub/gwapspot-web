import { NextResponse } from "next/server";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { DeliverableAdapterError, buildDeliverableReferenceFromRequest } from "../../../lib/ppv-deliverable-adapters";
import { verifyDeliverableSource } from "../../../lib/ppv-deliverable-verification";
import { isSourceProduct, isTransactionSignature } from "../../../lib/ppv-reputation/contracts";
import {
  DeliverableRegistrationError,
  GnsUnavailableError,
  PpvConfigurationError,
  getProjection,
  registerDeliverable,
} from "../../../lib/ppv-reputation-server";
import { auditAuthEvent, checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
const MAX_BODY_BYTES = 16 * 1024;
const OBJECT_ID = /^[A-Za-z0-9:_.-]{1,120}$/;

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...headers } });
}

/** Looks up the deliverable reference anchored to a product object. */
export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const sourceProduct = url.searchParams.get("sourceProduct");
  const sourceObjectId = url.searchParams.get("sourceObjectId") || "";
  const deliverableId = url.searchParams.get("deliverableId") || "";
  if (!isSourceProduct(sourceProduct) || !OBJECT_ID.test(sourceObjectId) || !OBJECT_ID.test(deliverableId)) {
    return json({ error: "Invalid deliverable lookup." }, 400);
  }
  try {
    const reference = await getProjection().findDeliverableReference({ sourceProduct, sourceObjectId, deliverableId });
    return json({ reference });
  } catch (error) {
    if (error instanceof PpvConfigurationError) return json({ error: "PPV deliverables are not configured." }, 503);
    return json({ error: "Deliverable lookup is temporarily unavailable." }, 503);
  }
}

/**
 * Anchors a product deliverable to a PPV proof. The caller must be the proof
 * authority; the proof is re-read from chain before anything is recorded.
 * Frontend claims about eligibility, hashes or ownership are never trusted.
 */
export async function POST(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  if (!hasValidOrigin(request)) {
    auditAuthEvent("ppv.deliverable.register", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }
  const rate = await checkRateLimit(`ppv-deliverable:${identity.userId}`, 10, 600_000);
  if (!rate.allowed) return json({ error: "Too many anchor requests." }, 429, { "Retry-After": String(rate.retryAfter) });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return json({ error: "Payload too large." }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Body must be a JSON object." }, 400);
  }

  try {
    const verified = await verifyDeliverableSource(identity, body);
    const draft = buildDeliverableReferenceFromRequest(verified, identity.verifiedWallet);
    const proofTransactionSignature =
      typeof body.proofTransactionSignature === "string" && isTransactionSignature(body.proofTransactionSignature)
        ? body.proofTransactionSignature
        : null;
    const result = await registerDeliverable({ draft, callerWallet: identity.verifiedWallet, proofTransactionSignature });
    auditAuthEvent("ppv.deliverable.register", identity.userId, "success");
    return json({ reference: result.reference, eventId: result.event.eventId, receiptIds: result.receiptIds, stored: result.stored }, result.stored ? 201 : 200);
  } catch (error) {
    if (error instanceof DeliverableAdapterError) return json({ error: error.message }, 400);
    if (error instanceof DeliverableRegistrationError) {
      auditAuthEvent("ppv.deliverable.register", identity.userId, "rejected");
      return json({ error: error.message }, error.status);
    }
    if (error instanceof PpvConfigurationError) return json({ error: "PPV deliverables are not configured." }, 503);
    if (error instanceof GnsUnavailableError) return json({ error: "GNS is temporarily unavailable. Try again." }, 503);
    auditAuthEvent("ppv.deliverable.register", identity.userId, "failed");
    console.error("ppv_deliverable_error", { name: error instanceof Error ? error.name : "Error" });
    return json({ error: "The deliverable could not be anchored." }, 503);
  }
}
