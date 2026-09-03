import { NextResponse } from "next/server";
import { getAuthenticatedWalletIdentity } from "../../../../../lib/privy-server";
import { PpvConfigurationError, prepareCredential } from "../../../../../lib/ppv-reputation-server";
import { auditAuthEvent, checkRateLimit, hasValidOrigin } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
const RECEIPT_ID = /^rcpt_[0-9a-f]{40}$/;

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...headers } });
}

/**
 * Evaluates credential eligibility for the authenticated holder. Nothing in
 * the request body is trusted: the holder is the session wallet, the receipt
 * is loaded from the projection, the proof is re-read from chain, and the
 * seal facts are derived from recorded events. No mint is performed.
 */
export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  if (!hasValidOrigin(request)) {
    auditAuthEvent("ppv.credential.prepare", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }
  const { receiptId } = await context.params;
  if (!RECEIPT_ID.test(receiptId)) return json({ error: "Invalid receipt id." }, 400);

  const rate = await checkRateLimit(`ppv-credential:${identity.userId}`, 10, 60_000);
  if (!rate.allowed) return json({ error: "Too many credential requests." }, 429, { "Retry-After": String(rate.retryAfter) });

  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const preparation = await prepareCredential(receiptId, identity.verifiedWallet, origin);
    if (!preparation) return json({ error: "Receipt not found." }, 404);
    if (!preparation.eligible) {
      auditAuthEvent("ppv.credential.prepare", identity.userId, "rejected");
      return json({ eligible: false, reasons: preparation.reasons }, 409);
    }
    auditAuthEvent("ppv.credential.prepare", identity.userId, "success");
    return json(preparation);
  } catch (error) {
    if (error instanceof PpvConfigurationError) return json({ error: "PPV credentials are not configured." }, 503);
    if (error instanceof Error && /signing secret/.test(error.message)) {
      return json({ error: "Credential minting is not enabled on this deployment." }, 503);
    }
    auditAuthEvent("ppv.credential.prepare", identity.userId, "failed");
    return json({ error: "Credential evaluation is temporarily unavailable." }, 503);
  }
}
