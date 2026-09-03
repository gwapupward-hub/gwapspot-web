import { NextResponse } from "next/server";
import { isValidInternalApiKey } from "../../../../lib/daily-ideas-telegram-account-core";
import { getPublicLookupSubject } from "../../../../lib/public-lookup";
import { isSolanaAddress } from "../../../../lib/ppv-reputation/contracts";
import { getProjection, PpvConfigurationError } from "../../../../lib/ppv-reputation-server";
import { computeReputationFacts } from "../../../../lib/ppv-reputation-facts";
import { checkRateLimit } from "../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...headers } });
}

/**
 * Factual PPV aggregate for one wallet: the GwapScore consumer input.
 * Counts only, recomputed from receipts. A service key skips the public rate
 * limit; without one the endpoint is still public because every number here
 * is derivable from chain.
 */
export async function GET(request: Request, context: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await context.params;
  if (!isSolanaAddress(wallet)) return json({ error: "Invalid wallet." }, 400);

  const serviceKey = process.env.PPV_FACTS_API_KEY;
  const trusted = isValidInternalApiKey(request.headers.get("authorization"), serviceKey);
  if (!trusted) {
    let rate;
    try {
      rate = await checkRateLimit(`ppv-facts:${getPublicLookupSubject(request.headers)}`, 30, 60_000);
    } catch {
      return json({ error: "Facts protection is temporarily unavailable." }, 503);
    }
    if (!rate.allowed) return json({ error: "Too many requests." }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  try {
    const projection = getProjection();
    const cached = await projection.getFacts(wallet);
    const facts = cached ?? computeReputationFacts(wallet, await projection.listWalletReceipts(wallet));
    return json(facts);
  } catch (error) {
    if (error instanceof PpvConfigurationError) return json({ error: "PPV facts are not configured." }, 503);
    return json({ error: "Facts are temporarily unavailable." }, 503);
  }
}
