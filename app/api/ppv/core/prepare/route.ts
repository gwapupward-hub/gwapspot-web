import { NextResponse } from "next/server";
import { PpvCoreRequestError } from "../../../../lib/ppv/core.server";
import { prepareCoreOperation } from "../../../../lib/ppv/core-operation.server";
import { isPpvCoreProofKind } from "../../../../lib/ppv/core";
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
  if (error instanceof PpvCoreRequestError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof PpvPolicyError) {
    return json(
      {
        error: "PPV Core is not ready for a signed devnet write.",
        code: error.code,
      },
      503,
    );
  }
  return json(
    { error: "PPV Core transaction preparation is temporarily unavailable." },
    503,
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
    auditAuthEvent("ppv.core.prepare", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `ppv-core-prepare:${identity.userId}`,
    12,
    60_000,
  );
  if (!rate.allowed) {
    auditAuthEvent("ppv.core.prepare", identity.userId, "rejected");
    return json(
      { error: "Too many PPV transaction requests. Try again shortly." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) {
    auditAuthEvent("ppv.core.prepare", identity.userId, "rejected");
    return json({ error: "PPV request is too large." }, 413);
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4_096) {
      throw new PpvCoreRequestError("REQUEST_TOO_LARGE", 413);
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const action = payload.action;

    if (action === "create") {
      if (
        typeof payload.proofIdHex !== "string" ||
        typeof payload.contentHashHex !== "string" ||
        typeof payload.contextHashHex !== "string" ||
        !isPpvCoreProofKind(payload.kind)
      ) {
        throw new PpvCoreRequestError("INVALID_CREATE_PROOF_REQUEST", 400);
      }
      const prepared = await prepareCoreOperation({
        action,
        authority: identity.verifiedWallet,
        proofIdHex: payload.proofIdHex,
        contentHashHex: payload.contentHashHex,
        contextHashHex: payload.contextHashHex,
        kind: payload.kind,
      });
      auditAuthEvent("ppv.core.prepare", identity.userId, "success");
      return json(prepared);
    }

    if (action === "revoke") {
      if (typeof payload.proofIdHex !== "string") {
        throw new PpvCoreRequestError("INVALID_REVOKE_PROOF_REQUEST", 400);
      }
      const prepared = await prepareCoreOperation({
        action,
        authority: identity.verifiedWallet,
        proofIdHex: payload.proofIdHex,
      });
      auditAuthEvent("ppv.core.prepare", identity.userId, "success");
      return json(prepared);
    }

    throw new PpvCoreRequestError("UNSUPPORTED_CORE_ACTION", 400);
  } catch (error) {
    auditAuthEvent("ppv.core.prepare", identity.userId, "failed");
    return policyResponse(error);
  }
}
