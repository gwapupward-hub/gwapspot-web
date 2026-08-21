import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "../../../../lib/redis";
import {
  getSocialVerifierSecret,
  isSocialPlatform,
  verifySocialChallenge,
} from "../../../../lib/social-proof-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VerifierPayload = {
  platform?: unknown;
  challengeCode?: unknown;
  socialHandle?: unknown;
  externalAccountId?: unknown;
  followedGwap?: unknown;
  dmObserved?: unknown;
};

function validSignature(raw: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader || !secret) return false;
  const provided = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = getSocialVerifierSecret();
  if (!secret) {
    return NextResponse.json({ error: "Verifier bridge is not configured" }, { status: 503 });
  }

  const rate = await checkDistributedRateLimit("social-proof-control:webhook", 240, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Rate limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-gwap-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw || "null") as VerifierPayload | null;
  if (
    !payload ||
    !isSocialPlatform(payload.platform) ||
    typeof payload.challengeCode !== "string" ||
    typeof payload.socialHandle !== "string"
  ) {
    return NextResponse.json({ error: "Invalid verifier payload" }, { status: 400 });
  }

  // The platform bridge is responsible for proving both facts from the
  // platform's own API/event stream. GWAP will never mark a challenge verified
  // merely because a client claims it sent the code.
  if (payload.followedGwap !== true || payload.dmObserved !== true) {
    return NextResponse.json(
      { error: "Follow and DM proof are both required" },
      { status: 409 },
    );
  }

  const result = await verifySocialChallenge({
    challengeCode: payload.challengeCode,
    platform: payload.platform,
    socialHandle: payload.socialHandle,
    externalAccountId:
      typeof payload.externalAccountId === "string" ? payload.externalAccountId : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    platform: result.record.platform,
    socialHandle: result.record.socialHandle,
    status: result.record.status,
    verifiedAt: result.record.verifiedAt,
  });
}
