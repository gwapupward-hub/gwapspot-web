import { NextResponse } from "next/server";
import { getPublicLookupSubject } from "../../../../lib/public-lookup";
import { getProjection, PpvConfigurationError } from "../../../../lib/ppv-reputation-server";
import { checkRateLimit } from "../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };
const RECEIPT_ID = /^rcpt_[0-9a-f]{40}$/;

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...headers } });
}

/** Public receipt read. A receipt contains only facts already visible on chain plus GNS snapshots. */
export async function GET(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await context.params;
  if (!RECEIPT_ID.test(receiptId)) return json({ error: "Invalid receipt id." }, 400);

  let rate;
  try {
    rate = await checkRateLimit(`ppv-receipt:${getPublicLookupSubject(request.headers)}`, 60, 60_000);
  } catch {
    return json({ error: "Receipt protection is temporarily unavailable." }, 503);
  }
  if (!rate.allowed) return json({ error: "Too many requests." }, 429, { "Retry-After": String(rate.retryAfter) });

  try {
    const receipt = await getProjection().getReceipt(receiptId);
    if (!receipt) return json({ error: "Receipt not found." }, 404);
    const event = await getProjection().getEvent(receipt.eventId);
    return json({ receipt, event });
  } catch (error) {
    if (error instanceof PpvConfigurationError) return json({ error: "PPV receipts are not configured." }, 503);
    return json({ error: "Receipts are temporarily unavailable." }, 503);
  }
}
