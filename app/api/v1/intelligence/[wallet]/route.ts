import { NextResponse } from "next/server";
import { isValidSolanaWallet } from "../../../../app/lib/asset-intelligence";
import { buildWalletIntelligence } from "../../../../app/lib/wallet-intelligence";
import { getPublicLookupSubject } from "../../../../lib/public-lookup";
import { checkRateLimit } from "../../../../lib/request-guard";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

type RouteContext = {
  params: Promise<{ wallet: string }>;
};

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...responseHeaders, ...headers },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { wallet: routeWallet } = await context.params;
  const wallet = routeWallet.trim();

  if (!isValidSolanaWallet(wallet)) {
    return json({ error: "Enter a valid Solana wallet address." }, 400);
  }

  let rateLimit;
  try {
    rateLimit = await checkRateLimit(
      `intelligence-v1:${getPublicLookupSubject(request.headers)}`,
      30,
      60_000,
    );
  } catch {
    return json(
      { error: "Wallet intelligence protection is temporarily unavailable." },
      503,
    );
  }

  if (!rateLimit.allowed) {
    return json(
      { error: "Too many intelligence requests. Try again shortly." },
      429,
      { "Retry-After": String(rateLimit.retryAfter) },
    );
  }

  return json(await buildWalletIntelligence(wallet));
}
