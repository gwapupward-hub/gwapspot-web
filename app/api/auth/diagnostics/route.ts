import { NextResponse } from "next/server";

const ALLOWED_EVENTS = new Set([
  "login_started",
  "login_failed",
  "login_completed",
  "session_token_missing",
  "session_ready",
]);

function safeText(value: unknown, max = 80) {
  if (typeof value !== "string") return null;
  return value.slice(0, max).replace(/[^a-zA-Z0-9_.:/-]/g, "_");
}

export async function POST(request: Request) {
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

  // Intentionally log only bounded diagnostic labels. Never send or log
  // signatures, wallet addresses, access/refresh tokens, or Privy secrets.
  console.info("[wallet-auth]", {
    event,
    code: safeText(body.code),
    phase: safeText(body.phase),
    provider: safeText(body.provider),
    host: safeText(body.host),
    userAgentClass: safeText(body.userAgentClass),
  });

  return NextResponse.json({ ok: true });
}
