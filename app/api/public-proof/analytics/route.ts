import { NextRequest, NextResponse } from "next/server";
import { getPublicLookupSubject } from "../../../lib/public-lookup";
import { checkDistributedRateLimit } from "../../../lib/redis";
import { isPublicProofEvent, trackPublicProofEvent } from "../../../lib/public-proof-analytics";
import { isPublicProofTheme } from "../../../lib/social-proof-control";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const subject = getPublicLookupSubject(request.headers);
  const rate = await checkDistributedRateLimit(`public-proof-analytics:${subject}`, 60, 60_000).catch(() => ({ allowed: true, retryAfter: 0 }));
  if (!rate.allowed) return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });

  const body = await request.json().catch(() => null) as { event?: unknown; challengeCode?: unknown; theme?: unknown } | null;
  if (!body || !isPublicProofEvent(body.event)) return NextResponse.json({ ok: false }, { status: 400 });

  const challengeCode = typeof body.challengeCode === "string" ? body.challengeCode.slice(0, 32) : null;
  const theme = isPublicProofTheme(body.theme) ? body.theme : null;
  await trackPublicProofEvent({ event: body.event, challengeCode, theme }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
