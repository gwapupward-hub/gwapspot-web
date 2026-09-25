import { NextResponse } from "next/server";
import { isGwapAppHostname } from "../../../../lib/app-domain-routing";
import { hasValidOrigin } from "../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "sign_started",
  "sign_failed",
  "broadcast_returned",
  "confirm_started",
]);

function safeText(value: unknown, max = 96) {
  if (typeof value !== "string") return null;
  return value.slice(0, max).replace(/[^a-zA-Z0-9_.:/-]/g, "_");
}

export async function POST(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isGwapAppHostname(host)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = safeText(body.event);
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Public, bounded diagnostics only. Never log wallet addresses, signatures,
  // access tokens, transaction bytes, evidence, hashes, or private material.
  console.info("ppv_client_transaction", {
    event,
    action: safeText(body.action, 16),
    code: safeText(body.code),
    walletType: safeText(body.walletType),
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
