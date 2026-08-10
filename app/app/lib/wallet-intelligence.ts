import "server-only";

import { fetchAssetIntelligence } from "./asset-intelligence";
import { getGnsApiBase, resolveGnsIdentity } from "./gns";
import { enrichPortfolio } from "./token-enrichment";
import { assessWalletRisk } from "../../lib/wallet-risk";

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
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildWalletIntelligence(wallet: string) {
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

  return {
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
          status: "hidden" as const,
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
      version: "v1" as const,
      network: "mainnet-beta" as const,
      generatedAt: new Date().toISOString(),
    },
  };
}
