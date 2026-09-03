import { NextResponse } from "next/server";
import { getPublicLookupSubject } from "../../../lib/public-lookup";
import { isSolanaAddress } from "../../../lib/ppv-reputation/contracts";
import { PpvConfigurationError, lookupVerifiedActivity } from "../../../lib/ppv-reputation-server";
import { checkRateLimit } from "../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
  "Access-Control-Allow-Origin": "*",
};

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...headers } });
}

const RECEIPT_ID = /^rcpt_[0-9a-f]{40}$/;
const GNS_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * GNS Verified Activity. Public and factual: seal state, product, activity,
 * role, counterparty, amount, date, receipt. No score is computed here.
 * Resolves by wallet, domain, proofId or receiptId.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet")?.trim() || null;
  const domainRaw = url.searchParams.get("domain")?.trim().toLowerCase() || null;
  const domain = domainRaw ? domainRaw.replace(/\.gwap$/, "") : null;
  const proofId = url.searchParams.get("proofId")?.trim() || null;
  const receiptId = url.searchParams.get("receiptId")?.trim() || null;
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

  if (wallet && !isSolanaAddress(wallet)) return json({ error: "Invalid wallet." }, 400);
  if (domain && !GNS_NAME.test(domain)) return json({ error: "Invalid .gwap name." }, 400);
  if (proofId && !isSolanaAddress(proofId)) return json({ error: "Invalid proof id." }, 400);
  if (receiptId && !RECEIPT_ID.test(receiptId)) return json({ error: "Invalid receipt id." }, 400);
  if (!wallet && !domain && !proofId && !receiptId) {
    return json({ error: "Provide wallet, domain, proofId or receiptId." }, 400);
  }

  let rate;
  try {
    rate = await checkRateLimit(`ppv-activity:${getPublicLookupSubject(request.headers)}`, 60, 60_000);
  } catch {
    return json({ error: "Activity lookup protection is temporarily unavailable." }, 503);
  }
  if (!rate.allowed) {
    return json({ error: "Too many lookups. Try again shortly." }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  try {
    const activity = await lookupVerifiedActivity({ wallet, domain, proofId, receiptId }, limit);
    if (!activity) return json({ error: "Nothing to resolve." }, 400);
    return json(activity);
  } catch (error) {
    if (error instanceof PpvConfigurationError) return json({ error: "PPV activity is not configured." }, 503);
    return json({ error: "Verified activity is temporarily unavailable." }, 503);
  }
}
