import { NextResponse } from "next/server";
import { isGwapAppHostname } from "../../../../lib/app-domain-routing";
import {
  GwapScoreWalletBridgeError,
  syncVerifiedWalletEvidenceToGwapScore,
} from "../../../../lib/gwapscore-wallet-bridge.server";
import { getAuthenticatedWalletIdentityResult } from "../../../../lib/privy-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: responseHeaders,
  });
}

/**
 * POST /api/gwapscore/wallet/sync
 *
 * The request body is intentionally ignored. Wallet authority comes only from
 * the verified Privy server session, and wallet history is derived server-side.
 */
export async function POST(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isGwapAppHostname(host)) {
    return json({ error: "GwapScore wallet sync is available only on app.gwapspot.com." }, 403);
  }

  const identityResult = await getAuthenticatedWalletIdentityResult(request);
  if (identityResult.status === "unauthenticated") {
    return json({ error: "Unauthorized" }, 401);
  }
  if (identityResult.status === "unavailable") {
    return json({ error: "Wallet identity is temporarily unavailable." }, 503);
  }

  const identity = identityResult.identity;
  if (!hasValidOrigin(request)) {
    auditAuthEvent("gwapscore.wallet.sync", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `gwapscore-wallet-sync:${identity.userId}`,
    5,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("gwapscore.wallet.sync", identity.userId, "rejected");
    return json({ error: "Too many wallet reputation sync requests. Try again shortly." }, 429);
  }

  try {
    const evidence = await syncVerifiedWalletEvidenceToGwapScore(identity.verifiedWallet);
    auditAuthEvent("gwapscore.wallet.sync", identity.userId, "success");
    return json({
      synced: true,
      wallet: identity.verifiedWallet,
      evidence: {
        walletAgeDays: evidence.walletAgeDays,
        txCount: evidence.txCount,
        stopReason: evidence.stopReason,
      },
    });
  } catch (error) {
    auditAuthEvent("gwapscore.wallet.sync", identity.userId, "failed");
    if (error instanceof GwapScoreWalletBridgeError) {
      return json(
        {
          error: error.message,
          code: error.code,
        },
        error.status,
      );
    }
    return json({ error: "GwapScore wallet evidence sync is temporarily unavailable." }, 503);
  }
}
