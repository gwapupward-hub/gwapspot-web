import { NextResponse } from "next/server";
import { authorizeDeveloperApiRequest } from "../../../../../app/lib/developer-api";
import { isValidSolanaWallet } from "../../../../../app/lib/asset-intelligence";
import { buildWalletIntelligence } from "../../../../../app/lib/wallet-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ wallet: string }>;
};

const baseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

function apiHeaders(
  authorization: Awaited<ReturnType<typeof authorizeDeveloperApiRequest>>,
) {
  const headers: Record<string, string> = { ...baseHeaders };
  if (authorization.keyId) headers["X-GWAP-Key-Id"] = authorization.keyId;
  if (authorization.plan) headers["X-GWAP-Plan"] = authorization.plan;
  if (authorization.usage) {
    headers["X-RateLimit-Limit"] = String(authorization.usage.limit);
    headers["X-RateLimit-Remaining"] = String(authorization.usage.remaining);
    headers["X-RateLimit-Reset"] = authorization.usage.resetAt;
  }
  return headers;
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizeDeveloperApiRequest(request);
  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
        headers: {
          ...apiHeaders(authorization),
          ...(authorization.status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }

  const { wallet: routeWallet } = await context.params;
  const wallet = routeWallet.trim();
  if (!isValidSolanaWallet(wallet)) {
    return NextResponse.json(
      { error: "Enter a valid Solana wallet address." },
      { status: 400, headers: apiHeaders(authorization) },
    );
  }

  try {
    const intelligence = await buildWalletIntelligence(wallet);
    return NextResponse.json(intelligence, {
      status: 200,
      headers: apiHeaders(authorization),
    });
  } catch {
    return NextResponse.json(
      { error: "Wallet intelligence is temporarily unavailable." },
      { status: 503, headers: apiHeaders(authorization) },
    );
  }
}
