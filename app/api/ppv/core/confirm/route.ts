import { NextResponse } from "next/server";
import { PpvCoreRequestError } from "../../../../lib/ppv/core.server";
import { confirmCoreOperation } from "../../../../lib/ppv/core-operation.server";
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
    auditAuthEvent("ppv.core.confirm", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `ppv-core-confirm:${identity.userId}`,
    30,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.core.confirm", identity.userId, "rejected");
    return json(
      { error: "Too many PPV confirmation requests. Try again shortly." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 2_048) {
      throw new PpvCoreRequestError("REQUEST_TOO_LARGE", 413);
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (
      (payload.action !== "create" && payload.action !== "revoke") ||
      typeof payload.proofIdHex !== "string" ||
      typeof payload.signature !== "string" ||
      (payload.operationId !== undefined && typeof payload.operationId !== "string") ||
      (payload.lastValidBlockHeight !== undefined &&
        (typeof payload.lastValidBlockHeight !== "number" ||
          !Number.isSafeInteger(payload.lastValidBlockHeight) ||
          payload.lastValidBlockHeight <= 0))
    ) {
      throw new PpvCoreRequestError("INVALID_CONFIRMATION_REQUEST", 400);
    }

    const result = await confirmCoreOperation({
      operationId:
        typeof payload.operationId === "string" && payload.operationId.trim()
          ? payload.operationId.trim()
          : undefined,
      action: payload.action,
      authority: identity.verifiedWallet,
      proofIdHex: payload.proofIdHex,
      signature: payload.signature,
      lastValidBlockHeight:
        typeof payload.lastValidBlockHeight === "number"
          ? payload.lastValidBlockHeight
          : undefined,
    });
    auditAuthEvent(
      "ppv.core.confirm",
      identity.userId,
      result.status === "finalized" ? "success" : "rejected",
    );
    return json(result, result.status === "pending" ? 202 : 200);
  } catch (error) {
    auditAuthEvent("ppv.core.confirm", identity.userId, "failed");
    if (error instanceof PpvCoreRequestError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof PpvPolicyError) {
      return json(
        {
          error: "PPV Core is not ready for a finalized devnet write.",
          code: error.code,
        },
        503,
      );
    }
    return json({ error: "PPV Core confirmation is temporarily unavailable." }, 503);
  }
}
