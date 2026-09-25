import { NextResponse } from "next/server";
import { PpvCommerceRequestError } from "../../../../lib/ppv/commerce.server";
import { confirmCommerceOperation } from "../../../../lib/ppv/commerce-operation.server";
import { PpvPolicyError } from "../../../../lib/ppv/policy";
import { isGwapAppHostname } from "../../../../lib/app-domain-routing";
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

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...responseHeaders, ...headers },
  });
}

export async function POST(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isGwapAppHostname(host)) {
    return json({ error: "PPV signed writes are available only on app.gwapspot.com." }, 403);
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
    auditAuthEvent("ppv.commerce.confirm", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `ppv-commerce-confirm:${identity.userId}`,
    30,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.commerce.confirm", identity.userId, "rejected");
    return json(
      { error: "Too many Commerce confirmation requests. Try again shortly." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 2_048) {
      throw new PpvCommerceRequestError("REQUEST_TOO_LARGE", 413);
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (
      typeof payload.operationId !== "string" ||
      !payload.operationId.trim() ||
      typeof payload.signature !== "string"
    ) {
      throw new PpvCommerceRequestError("INVALID_CONFIRMATION_REQUEST", 400);
    }

    const result = await confirmCommerceOperation({
      operationId: payload.operationId.trim(),
      authority: identity.verifiedWallet,
      signature: payload.signature,
    });
    auditAuthEvent(
      "ppv.commerce.confirm",
      identity.userId,
      result.status === "finalized" ? "success" : "rejected",
    );
    return json(result, result.status === "pending" ? 202 : 200);
  } catch (error) {
    auditAuthEvent("ppv.commerce.confirm", identity.userId, "failed");
    if (error instanceof PpvCommerceRequestError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof PpvPolicyError) {
      return json(
        {
          error: "PPV Commerce is not ready for finalized devnet verification.",
          code: error.code,
        },
        503,
      );
    }
    return json(
      { error: "PPV Commerce confirmation is temporarily unavailable." },
      503,
    );
  }
}
