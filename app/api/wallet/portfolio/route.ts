import { NextResponse } from "next/server";
import { fetchAssetIntelligence } from "../../../app/lib/asset-intelligence";
import { enrichPortfolio } from "../../../app/lib/token-enrichment";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit } from "../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(payload: unknown, status = 200, extra?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...responseHeaders, ...extra },
  });
}

export async function GET(request: Request) {
  if (!isWalletAuthConfigured()) {
    return json({ error: "Authentication unavailable" }, 503);
  }

  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);

  const rate = await checkRateLimit(
    `wallet-portfolio:${identity.userId}`,
    30,
    60_000,
  );
  if (!rate.allowed) {
    return json(
      { error: "Too many portfolio refreshes. Try again shortly." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const assets = await fetchAssetIntelligence(identity.verifiedWallet, {
      timeoutMs: 8_000,
    });
    const portfolio = await enrichPortfolio(assets, { timeoutMs: 8_000 });

    return json({
      wallet: identity.verifiedWallet,
      network: "mainnet-beta" as const,
      status: assets.status,
      sol: assets.sol,
      tokenAccountCount: assets.tokenAccountCount,
      uniqueMintCount: assets.uniqueMintCount,
      tokenPrograms: assets.tokenPrograms,
      portfolio,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return json({ error: "Wallet portfolio is temporarily unavailable." }, 503);
  }
}
