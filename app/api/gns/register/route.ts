import { NextResponse } from "next/server";
import {
  GnsApiError,
  getGnsRegistrationConfig,
  registerGnsIdentity,
  resolveGnsName,
} from "../../../app/lib/gns";
import {
  GNS_NAME_PATTERN,
  isValidSolanaSignature,
  normalizeGnsName,
} from "../../../app/lib/gns-registration";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../../lib/request-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit(`gns-config:${identity.userId}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many registry requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const config = await getGnsRegistrationConfig();
    return NextResponse.json(config, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "GNS on-chain registration is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    auditAuthEvent("gns.register", identity.userId, "rejected");
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const rate = await checkRateLimit(`gns-register:${identity.userId}`, 6, 600_000);
  if (!rate.allowed) {
    auditAuthEvent("gns.register", identity.userId, "rejected");
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_024) {
    auditAuthEvent("gns.register", identity.userId, "rejected");
    return NextResponse.json({ error: "Registration payload is too large." }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1_024) {
      auditAuthEvent("gns.register", identity.userId, "rejected");
      return NextResponse.json(
        { error: "Registration payload is too large." },
        { status: 413 },
      );
    }

    const payload = JSON.parse(rawBody) as {
      name?: unknown;
      txSignature?: unknown;
    };
    const name = normalizeGnsName(
      typeof payload.name === "string" ? payload.name : "",
    );
    const txSignature =
      typeof payload.txSignature === "string" ? payload.txSignature.trim() : "";

    if (!GNS_NAME_PATTERN.test(name)) {
      auditAuthEvent("gns.register", identity.userId, "rejected");
      return NextResponse.json(
        { error: "Use 1–32 lowercase letters, numbers, or internal hyphens." },
        { status: 400 },
      );
    }
    if (!isValidSolanaSignature(txSignature)) {
      auditAuthEvent("gns.register", identity.userId, "rejected");
      return NextResponse.json(
        { error: "A valid Solana transaction signature is required." },
        { status: 400 },
      );
    }

    try {
      await registerGnsIdentity({
        name,
        owner: identity.verifiedWallet,
        txSignature,
      });
    } catch (error) {
      const resolved = await resolveGnsName(name);
      if (resolved?.found && resolved.owner === identity.verifiedWallet) {
        auditAuthEvent("gns.register", identity.userId, "success");
        return NextResponse.json({
          fullName: `${name}.gwap`,
          name,
          recovered: true,
          txSignature,
        });
      }

      auditAuthEvent("gns.register", identity.userId, "failed");
      const status =
        error instanceof GnsApiError && error.status >= 400 && error.status < 500
          ? error.status
          : 502;
      const message =
        error instanceof GnsApiError
          ? error.message
          : "GNS could not verify the transaction receipt.";
      return NextResponse.json({ error: message }, { status });
    }

    auditAuthEvent("gns.register", identity.userId, "success");
    return NextResponse.json({
      fullName: `${name}.gwap`,
      name,
      recovered: false,
      txSignature,
    });
  } catch {
    auditAuthEvent("gns.register", identity.userId, "failed");
    return NextResponse.json(
      { error: "Registration receipt could not be processed." },
      { status: 400 },
    );
  }
}
