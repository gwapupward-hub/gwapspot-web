import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../auth-config";
import { getAuthenticatedWalletIdentity } from "../privy-server";
import { checkRateLimit, hasValidOrigin } from "../request-guard";
import { GwapScoreSocialError } from "./service";

export async function authenticateGwapScoreRequest(request: Request) {
  if (!isWalletAuthConfigured()) return null;
  return getAuthenticatedWalletIdentity(request);
}

export async function guardGwapScoreMutation(
  request: Request,
  userId: string,
  action: string,
  limit = 10,
) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const rate = await checkRateLimit(
    `gwapscore-social:${action}:${userId}`,
    limit,
    60_000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }
  return null;
}

export function gwapScoreErrorResponse(error: unknown) {
  if (error instanceof GwapScoreSocialError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("gwapscore_social_error", {
    name: error instanceof Error ? error.name : "Error",
  });
  return NextResponse.json({ error: "GwapScore request failed" }, { status: 500 });
}

export function hasValidInternalSecret(request: Request) {
  const expected = process.env.GWAPSCORE_INTERNAL_SECRET;
  const provided = request.headers.get("x-gwapscore-internal-secret");
  if (!expected || !provided || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
