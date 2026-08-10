import { NextResponse } from "next/server";
import {
  fetchAssetIntelligence,
  isValidSolanaWallet,
} from "../../../../app/lib/asset-intelligence";
import { getGnsApiBase, resolveGnsIdentity } from "../../../../app/lib/gns";
import { enrichPortfolio } from "../../../../app/lib/token-enrichment";
import { getPublicLookupSubject } from "../../../../lib/public-lookup";
import { checkRateLimit } from "../../../../lib/request-guard";
import { assessWalletRisk } from "../../../../lib/wallet-risk";

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

async function isScoreHidden(name: string | null, isGenesis: boolean) {
  if (!name || !isGenesis) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(
      `${getGnsApiBase()}/profile/${encodeURIComponent(name)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) return true;
    const profile = (await response.json()) as Record<string, unknown>;
    return profile.is_genesis === true && profile.score_hidden === true;
  } catch {
    // Fail closed for Genesis profiles if score visibility cannot be verified.
    return true;
  } finally {
    clearTimeout(timeout);
  }
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

  const [identity, assets] = await Promise.all([
    resolveGnsIdentity(wallet, {
      timeoutMs: 7_500,
      scoreTimeoutMs: 12_000,
    }),
    fetchAssetIntelligence(wallet, { timeoutMs: 8_000 }),
  ]);
  const [scoreHidden, portfolio] = await Promise.all([
    isScoreHidden(identity.name, identity.isGenesis),
    enrichPortfolio(assets, { timeoutMs: 8_000 }),
  ]);
  const risk = assessWalletRisk(portfolio);

  return json({
    wallet,
    identity: {
      status: identity.status,
      name: identity.name,
      fullName: identity.fullName,
      verified: identity.verified,
      isGenesis: identity.isGenesis,
      tier: identity.tier,
      profileUrl: identity.profileUrl,
    },
    reputation: scoreHidden
      ? {
          status: "hidden",
          gwapScore: null,
          tier: null,
          message: "This Genesis identity has chosen to keep its GwapScore private.",
        }
      : {
          status: identity.scoreStatus,
          gwapScore: identity.score,
          tier: identity.scoreTier,
          message: identity.scoreMessage,
        },
    assets,
    portfolio,
    risk,
    meta: {
      version: "v1",
      network: "mainnet-beta",
      generatedAt: new Date().toISOString(),
    },
  });
}
