import { NextResponse } from "next/server";
import {
  PpvCommerceRequestError,
  readCommerceAgreement,
} from "../../../../lib/ppv/commerce.server";
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

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: responseHeaders,
  });
}

export async function POST(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isGwapAppHostname(host)) {
    return json({ error: "PPV agreement reads are available only on app.gwapspot.com." }, 403);
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
    auditAuthEvent("ppv.commerce.read", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `ppv-commerce-read:${identity.userId}`,
    30,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.commerce.read", identity.userId, "rejected");
    return json({ error: "Too many Commerce read requests. Try again shortly." }, 429);
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1_024) {
      throw new PpvCommerceRequestError("REQUEST_TOO_LARGE", 413);
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (
      typeof payload.partyA !== "string" ||
      typeof payload.agreementIdHex !== "string"
    ) {
      throw new PpvCommerceRequestError("INVALID_AGREEMENT_READ_REQUEST", 400);
    }

    const record = await readCommerceAgreement({
      authority: identity.verifiedWallet,
      partyA: payload.partyA,
      agreementIdHex: payload.agreementIdHex,
    });
    auditAuthEvent("ppv.commerce.read", identity.userId, "success");
    return json(record);
  } catch (error) {
    auditAuthEvent("ppv.commerce.read", identity.userId, "failed");
    if (error instanceof PpvCommerceRequestError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof PpvPolicyError) {
      return json(
        { error: "PPV Commerce read service is unavailable.", code: error.code },
        503,
      );
    }
    return json({ error: "PPV Commerce read service is temporarily unavailable." }, 503);
  }
}
