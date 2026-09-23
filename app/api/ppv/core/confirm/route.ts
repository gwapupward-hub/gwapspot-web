import { NextResponse } from "next/server";
import {
  PpvCoreRequestError,
  confirmCoreProofTransaction,
} from "../../../../lib/ppv/core.server";
import { PpvPolicyError } from "../../../../lib/ppv/policy";
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
      typeof payload.signature !== "string"
    ) {
      throw new PpvCoreRequestError("INVALID_CONFIRMATION_REQUEST", 400);
    }

    const result = await confirmCoreProofTransaction({
      action: payload.action,
      authority: identity.verifiedWallet,
      proofIdHex: payload.proofIdHex,
      signature: payload.signature,
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
