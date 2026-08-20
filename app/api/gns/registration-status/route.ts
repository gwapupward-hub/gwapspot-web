import { NextResponse } from "next/server";
import { getGnsRegistrationConfig } from "../../../app/lib/gns";
import {
  isValidSolanaSignature,
  isValidGnsName,
  normalizeGnsName,
  type GnsNetwork,
} from "../../../app/lib/gns-registration";
import { getOrCreateGwapAccount } from "../../../lib/gwap-account";
import {
  clearGnsRegistrationSync,
  getGnsRegistrationSync,
  reconcileGnsRegistrationSync,
  trackGnsRegistrationSync,
  type GnsRegistrationSyncRecord,
} from "../../../lib/gns-registration-sync";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_048;
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(payload: unknown, status = 200, extra?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...responseHeaders, ...extra },
  });
}

function publicRecord(record: GnsRegistrationSyncRecord | null) {
  if (!record) return null;
  return {
    name: record.name,
    fullName: `${record.name}.gwap`,
    txSignature: record.txSignature,
    network: record.network,
    status: record.status,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    attempts: record.attempts,
    recovered: record.recovered,
    error: record.error,
  };
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);

  const rate = await checkRateLimit(
    `gns-registration-status-read:${identity.userId}`,
    60,
    60_000,
  );
  if (!rate.allowed) {
    return json(
      { error: "Too many registry status checks." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const account = await getOrCreateGwapAccount(identity);
    const record = await getGnsRegistrationSync(account.id);
    return json({ registration: publicRecord(record) });
  } catch {
    return json({ error: "Registration status is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  if (!hasValidOrigin(request)) {
    auditAuthEvent("gns.registration-sync", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const rate = await checkRateLimit(
    `gns-registration-status-write:${identity.userId}`,
    30,
    60_000,
  );
  if (!rate.allowed) {
    return json(
      { error: "Too many registry sync requests." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  const body = await readBody(request);
  const action = typeof body?.action === "string" ? body.action : "";
  if (!body || !["track", "reconcile", "clear"].includes(action)) {
    return json({ error: "Invalid registration sync request." }, 400);
  }

  try {
    const account = await getOrCreateGwapAccount(identity);

    if (action === "clear") {
      await clearGnsRegistrationSync(account.id);
      auditAuthEvent("gns.registration-sync.clear", identity.userId, "success");
      return json({ registration: null });
    }

    if (action === "reconcile") {
      const record = await reconcileGnsRegistrationSync(account.id);
      if (!record) return json({ error: "No pending registration was found." }, 404);
      auditAuthEvent("gns.registration-sync.reconcile", identity.userId, "success");
      return json({ registration: publicRecord(record) });
    }

    const name = normalizeGnsName(
      typeof body.name === "string" ? body.name : "",
    );
    const txSignature =
      typeof body.txSignature === "string" ? body.txSignature.trim() : "";
    const network = typeof body.network === "string" ? body.network : "";

    if (!isValidGnsName(name) || !isValidSolanaSignature(txSignature)) {
      return json({ error: "A valid .gwap name and Solana signature are required." }, 400);
    }
    if (
      network !== "devnet" &&
      network !== "testnet" &&
      network !== "mainnet-beta"
    ) {
      return json({ error: "Invalid GNS network." }, 400);
    }

    const config = await getGnsRegistrationConfig();
    if (config.network !== network) {
      auditAuthEvent("gns.registration-sync.track", identity.userId, "rejected");
      return json({ error: "GNS network changed before the receipt could be tracked." }, 409);
    }

    const record = await trackGnsRegistrationSync({
      accountId: account.id,
      owner: identity.verifiedWallet,
      name,
      txSignature,
      network: network as GnsNetwork,
    });
    if (!record) return json({ error: "Registration receipt could not be tracked." }, 400);

    auditAuthEvent("gns.registration-sync.track", identity.userId, "success");
    return json({ registration: publicRecord(record) }, 201);
  } catch {
    auditAuthEvent("gns.registration-sync", identity.userId, "failed");
    return json({ error: "Registration sync is temporarily unavailable." }, 503);
  }
}
