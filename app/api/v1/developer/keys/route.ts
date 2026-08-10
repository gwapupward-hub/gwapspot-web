import { NextResponse } from "next/server";
import {
  createDeveloperApiKey,
  getDeveloperApiAccount,
  revokeDeveloperApiKey,
} from "../../../../app/lib/developer-api";
import { getAuthenticatedWalletIdentity } from "../../../../lib/privy-server";
import { checkRateLimit, hasValidOrigin } from "../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

function json(payload: unknown, status = 200, extraHeaders?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...headers, ...extraHeaders },
  });
}

async function requireIdentity(request: Request) {
  return getAuthenticatedWalletIdentity(request);
}

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);

  try {
    const account = await getDeveloperApiAccount(identity.userId);
    return json(account);
  } catch {
    return json({ error: "Developer API storage is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  if (!hasValidOrigin(request)) return json({ error: "Invalid origin" }, 403);

  try {
    const rate = await checkRateLimit(`developer-key-create:${identity.userId}`, 5, 60 * 60_000);
    if (!rate.allowed) {
      return json(
        { error: "Too many API key creation attempts." },
        429,
        { "Retry-After": String(rate.retryAfter) },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { label?: unknown };
    const created = await createDeveloperApiKey(identity.userId, body.label);
    return json(
      {
        ...created,
        warning: "Copy this API key now. GWAP does not store the plaintext secret and cannot show it again.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "API_KEY_LIMIT") {
      return json({ error: "Revoke an existing key before creating another." }, 409);
    }
    return json({ error: "Unable to create an API key right now." }, 503);
  }
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  if (!hasValidOrigin(request)) return json({ error: "Invalid origin" }, 403);

  const body = (await request.json().catch(() => null)) as { keyId?: unknown } | null;
  if (!body || typeof body.keyId !== "string" || !/^[a-f0-9]{16}$/.test(body.keyId)) {
    return json({ error: "A valid keyId is required." }, 400);
  }

  try {
    const revoked = await revokeDeveloperApiKey(identity.userId, body.keyId);
    if (!revoked) return json({ error: "Active API key not found." }, 404);
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return json({ error: "Unable to revoke the API key right now." }, 503);
  }
}
