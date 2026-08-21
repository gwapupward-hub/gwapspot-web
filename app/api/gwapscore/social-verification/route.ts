import { NextResponse } from "next/server";
import { resolveDailyIdeasGwapAccount } from "../../../lib/daily-ideas-gwap-account";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import {
  checkRateLimit,
  hasValidOrigin,
} from "../../../lib/request-guard";
import {
  SOCIAL_PLATFORMS,
  getSocialPlatformConfig,
  isSocialPlatform,
  issueSocialChallenge,
  listSocialVerifications,
  markSocialChallengeSent,
  revokeSocialVerification,
} from "../../../lib/social-proof-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionBody = {
  action?: unknown;
  platform?: unknown;
  handle?: unknown;
};

function publicRecord(record: Awaited<ReturnType<typeof listSocialVerifications>>[number]) {
  return {
    platform: record.platform,
    socialHandle: record.socialHandle,
    challengeCode:
      record.status === "challenge-issued" || record.status === "awaiting-dm"
        ? record.challengeCode
        : null,
    status: record.status,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    verifiedAt: record.verifiedAt,
    revokedAt: record.revokedAt,
  };
}

async function resolveAccount(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return null;
  const account = await resolveDailyIdeasGwapAccount(identity);
  return { identity, account };
}

export async function GET(request: Request) {
  const resolved = await resolveAccount(request);
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const records = await listSocialVerifications(resolved.account.id);
    const platforms = SOCIAL_PLATFORMS.map((platform) => getSocialPlatformConfig(platform));
    return NextResponse.json(
      {
        platforms,
        records: records.map(publicRecord),
        summary: {
          enabled: platforms.some((platform) => platform.verifierEnabled),
          verifiedCount: records.filter((record) => record.status === "verified").length,
          pendingCount: records.filter(
            (record) => record.status === "challenge-issued" || record.status === "awaiting-dm",
          ).length,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Social verification is temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const resolved = await resolveAccount(request);
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const rate = await checkRateLimit(
    `social-proof-control:${resolved.account.id}`,
    20,
    60 * 60_000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many verification actions. Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as ActionBody | null;
  if (!body || !isSocialPlatform(body.platform)) {
    return NextResponse.json({ error: "Unsupported social platform" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  try {
    if (action === "issue") {
      const handle = typeof body.handle === "string" ? body.handle : "";
      const result = await issueSocialChallenge(resolved.account.id, body.platform, handle);
      if (!result.ok) {
        const messages = {
          verifier_unavailable: "Proof-of-Control is not enabled for this platform yet.",
          invalid_handle: "Enter a valid social handle.",
          handle_already_verified: "That social account is already verified to another GWAP account.",
          revoke_existing_first: "Revoke the existing verified account before verifying a different handle.",
        } as const;
        return NextResponse.json(
          { error: messages[result.reason] },
          { status: result.reason === "verifier_unavailable" ? 503 : 409 },
        );
      }
      return NextResponse.json({ record: publicRecord(result.record) });
    }

    if (action === "mark-sent") {
      const record = await markSocialChallengeSent(resolved.account.id, body.platform);
      if (!record) return NextResponse.json({ error: "No active challenge" }, { status: 404 });
      return NextResponse.json({ record: publicRecord(record) });
    }

    if (action === "revoke") {
      const record = await revokeSocialVerification(resolved.account.id, body.platform);
      if (!record) return NextResponse.json({ error: "No social verification found" }, { status: 404 });
      return NextResponse.json({ record: publicRecord(record) });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Social verification action failed" },
      { status: 503 },
    );
  }
}
