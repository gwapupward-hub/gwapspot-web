import { NextResponse } from "next/server";
import { isGwapAppHostname } from "../../../../lib/app-domain-routing";
import {
  PpvCoreRequestError,
  readCoreProofRecord,
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

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: responseHeaders,
  });
}

export async function POST(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isGwapAppHostname(host)) {
    return json({ error: "PPV proof verification is available only on app.gwapspot.com." }, 403);
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
    auditAuthEvent("ppv.core.verify", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `ppv-core-verify:${identity.userId}`,
    30,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.core.verify", identity.userId, "rejected");
    return json(
      { error: "Too many PPV verification requests. Try again shortly." },
      429,
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1_024) {
      throw new PpvCoreRequestError("REQUEST_TOO_LARGE", 413);
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof payload.proofIdHex !== "string") {
      throw new PpvCoreRequestError("INVALID_VERIFICATION_REQUEST", 400);
    }

    const record = await readCoreProofRecord({
      authority: identity.verifiedWallet,
      proofIdHex: payload.proofIdHex,
    });
    auditAuthEvent("ppv.core.verify", identity.userId, "success");
    return json(record);
  } catch (error) {
    auditAuthEvent("ppv.core.verify", identity.userId, "failed");
    if (error instanceof PpvCoreRequestError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof PpvPolicyError) {
      return json(
        {
          error: "PPV Core verification is temporarily unavailable.",
          code: error.code,
        },
        503,
      );
    }
    return json({ error: "PPV Core verification is temporarily unavailable." }, 503);
  }
}
