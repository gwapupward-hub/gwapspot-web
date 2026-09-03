import { NextResponse } from "next/server";
import {
  GnsUnavailableError,
  PpvConfigurationError,
  ingestWebhookPayload,
} from "../../../../lib/ppv-reputation-server";
import {
  MAX_WEBHOOK_BODY_BYTES,
  verifyStaticAuthorization,
  verifyWebhookHmac,
} from "../../../../lib/ppv-reputation-webhook-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: responseHeaders });
}

/**
 * Helius webhook for PPV program transactions.
 *
 * The signature is verified over the raw body bytes before anything is
 * parsed. `PPV_HELIUS_WEBHOOK_SECRET` (HMAC-SHA256, `x-helius-signature`) is
 * required; `PPV_HELIUS_WEBHOOK_AUTH` (static `Authorization` header) is an
 * optional second factor. Without a configured secret the endpoint fails
 * closed. Every write downstream is idempotent, so Helius retries are safe.
 */
export async function POST(request: Request) {
  const secret = process.env.PPV_HELIUS_WEBHOOK_SECRET?.trim() || "";
  if (!secret) return json({ error: "PPV webhook is not configured." }, 503);

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_WEBHOOK_BODY_BYTES) return json({ error: "Payload too large." }, 413);
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) return json({ error: "Payload too large." }, 413);

  const signature =
    request.headers.get("x-helius-signature") ?? request.headers.get("x-helius-signature-256");
  if (!verifyWebhookHmac(rawBody, signature, secret)) {
    return json({ error: "Invalid webhook signature." }, 401);
  }
  const staticAuth = process.env.PPV_HELIUS_WEBHOOK_AUTH?.trim() || "";
  if (staticAuth && !verifyStaticAuthorization(request.headers.get("authorization"), staticAuth)) {
    return json({ error: "Invalid webhook authorization." }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return json({ error: "Webhook body must be JSON." }, 400);
  }

  try {
    const { results, skippedItems } = await ingestWebhookPayload(payload);
    return json({
      ok: true,
      transactions: results.length,
      stored: results.reduce((sum, r) => sum + r.stored, 0),
      receipts: results.reduce((sum, r) => sum + r.receipts, 0),
      malformed: results.reduce((sum, r) => sum + r.malformed, 0),
      skippedItems,
    });
  } catch (error) {
    if (error instanceof PpvConfigurationError) return json({ error: "PPV programs are not configured." }, 503);
    if (error instanceof GnsUnavailableError) {
      // Ask Helius to retry rather than freezing a wrong identity snapshot.
      return json({ error: "Identity snapshot unavailable; retry." }, 503);
    }
    console.error("ppv_webhook_error", { name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Webhook processing failed; retry." }, 500);
  }
}
