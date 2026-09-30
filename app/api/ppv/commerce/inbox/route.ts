import { NextResponse } from "next/server";
import { isGwapAppHostname } from "../../../../lib/app-domain-routing";
import { getAuthenticatedWalletIdentityResult } from "../../../../lib/privy-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../../../lib/request-guard";
import {
  listCommerceInbox,
  pendingIncomingCommerceCount,
  PpvCommerceInboxError,
  syncCommerceInboxAgreement,
} from "../../../../lib/ppv/commerce-inbox.server";
import { PpvCommerceRequestError } from "../../../../lib/ppv/commerce.server";
import { PpvPolicyError } from "../../../../lib/ppv/policy";

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

function errorResponse(error: unknown) {
  if (error instanceof PpvCommerceInboxError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof PpvCommerceRequestError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof PpvPolicyError) {
    return json(
      { error: "PPV Commerce inbox is temporarily unavailable.", code: error.code },
      503,
    );
  }
  return json({ error: "PPV Commerce inbox is temporarily unavailable." }, 503);
}

async function identityForRequest(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isGwapAppHostname(host)) {
    return { response: json({ error: "PPV Commerce inbox is available only on GWAP OS." }, 403) };
  }

  const result = await getAuthenticatedWalletIdentityResult(request);
  if (result.status === "unauthenticated") {
    return { response: json({ error: "Unauthorized" }, 401) };
  }
  if (result.status === "unavailable") {
    return { response: json({ error: "Wallet identity is temporarily unavailable." }, 503) };
  }
  return { identity: result.identity };
}

export async function GET(request: Request) {
  const auth = await identityForRequest(request);
  if ("response" in auth) return auth.response;
  const identity = auth.identity;

  const rate = await checkRateLimit(
    `ppv-commerce-inbox-read:${identity.userId}`,
    30,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.commerce.inbox.read", identity.userId, "rejected");
    return json(
      { error: "Too many Commerce inbox requests. Try again shortly." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const items = await listCommerceInbox(identity.verifiedWallet);
    auditAuthEvent("ppv.commerce.inbox.read", identity.userId, "success");
    return json({
      items,
      pendingIncoming: pendingIncomingCommerceCount(
        identity.verifiedWallet,
        items,
      ),
    });
  } catch (error) {
    auditAuthEvent("ppv.commerce.inbox.read", identity.userId, "failed");
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await identityForRequest(request);
  if ("response" in auth) return auth.response;
  const identity = auth.identity;

  if (!hasValidOrigin(request)) {
    auditAuthEvent("ppv.commerce.inbox.sync", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `ppv-commerce-inbox-sync:${identity.userId}`,
    16,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.commerce.inbox.sync", identity.userId, "rejected");
    return json(
      { error: "Too many Commerce inbox updates. Try again shortly." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 48_000) {
      throw new PpvCommerceInboxError("REQUEST_TOO_LARGE", 413);
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (
      typeof payload.partyA !== "string" ||
      typeof payload.agreementIdHex !== "string" ||
      typeof payload.content !== "string" ||
      typeof payload.terms !== "string"
    ) {
      throw new PpvCommerceInboxError("INVALID_COMMERCE_INBOX_SYNC", 400);
    }

    const item = await syncCommerceInboxAgreement({
      authority: identity.verifiedWallet,
      partyA: payload.partyA,
      agreementIdHex: payload.agreementIdHex,
      content: payload.content,
      terms: payload.terms,
    });
    auditAuthEvent("ppv.commerce.inbox.sync", identity.userId, "success");
    return json({ item });
  } catch (error) {
    auditAuthEvent("ppv.commerce.inbox.sync", identity.userId, "failed");
    return errorResponse(error);
  }
}
