import { NextResponse } from "next/server";
import {
  PpvCommerceRequestError,
  type PrepareCommerceInput,
} from "../../../../lib/ppv/commerce.server";
import { prepareCommerceOperation } from "../../../../lib/ppv/commerce-operation.server";
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

function policyResponse(error: unknown) {
  if (error instanceof PpvCommerceRequestError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof PpvPolicyError) {
    return json(
      {
        error: "PPV Commerce is not ready for a signed devnet write.",
        code: error.code,
      },
      503,
    );
  }
  return json(
    { error: "PPV Commerce transaction preparation is temporarily unavailable." },
    503,
  );
}

function positiveVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
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
    auditAuthEvent("ppv.commerce.prepare", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `ppv-commerce-prepare:${identity.userId}`,
    12,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.commerce.prepare", identity.userId, "rejected");
    return json(
      { error: "Too many Commerce transaction requests. Try again shortly." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4_096) {
      throw new PpvCommerceRequestError("REQUEST_TOO_LARGE", 413);
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    let input: PrepareCommerceInput;
    if (payload.action === "create") {
      if (
        typeof payload.agreementIdHex !== "string" ||
        typeof payload.partyB !== "string" ||
        typeof payload.contentHashHex !== "string" ||
        typeof payload.termsHashHex !== "string" ||
        typeof payload.expiresAtUnix !== "number" ||
        !Number.isSafeInteger(payload.expiresAtUnix)
      ) {
        throw new PpvCommerceRequestError("INVALID_CREATE_AGREEMENT_REQUEST", 400);
      }
      input = {
        action: "create",
        authority: identity.verifiedWallet,
        agreementIdHex: payload.agreementIdHex,
        partyB: payload.partyB,
        contentHashHex: payload.contentHashHex,
        termsHashHex: payload.termsHashHex,
        expiresAtUnix: payload.expiresAtUnix,
      };
    } else if (payload.action === "revise" || payload.action === "sign") {
      if (
        typeof payload.partyA !== "string" ||
        typeof payload.agreementIdHex !== "string" ||
        !positiveVersion(payload.expectedVersion) ||
        typeof payload.contentHashHex !== "string" ||
        typeof payload.termsHashHex !== "string"
      ) {
        throw new PpvCommerceRequestError("INVALID_AGREEMENT_MUTATION_REQUEST", 400);
      }
      input = {
        action: payload.action,
        authority: identity.verifiedWallet,
        partyA: payload.partyA,
        agreementIdHex: payload.agreementIdHex,
        expectedVersion: payload.expectedVersion,
        contentHashHex: payload.contentHashHex,
        termsHashHex: payload.termsHashHex,
      };
    } else if (payload.action === "cancel") {
      if (
        typeof payload.partyA !== "string" ||
        typeof payload.agreementIdHex !== "string"
      ) {
        throw new PpvCommerceRequestError("INVALID_CANCEL_AGREEMENT_REQUEST", 400);
      }
      input = {
        action: "cancel",
        authority: identity.verifiedWallet,
        partyA: payload.partyA,
        agreementIdHex: payload.agreementIdHex,
      };
    } else {
      throw new PpvCommerceRequestError("UNSUPPORTED_COMMERCE_ACTION", 400);
    }

    const prepared = await prepareCommerceOperation(input);
    auditAuthEvent("ppv.commerce.prepare", identity.userId, "success");
    return json(prepared);
  } catch (error) {
    auditAuthEvent("ppv.commerce.prepare", identity.userId, "failed");
    return policyResponse(error);
  }
}
