import { NextResponse } from "next/server";
import { resolveGnsIdentity } from "../../../app/lib/gns";
import {
  getOrCreateGwapAccount,
  updateGwapAccountGnsIdentity,
} from "../../../lib/gwap-account";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit } from "../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);

  const rate = await checkRateLimit(
    `gns-identity-read:${identity.userId}`,
    20,
    60_000,
  );
  if (!rate.allowed) {
    return json(
      { error: "Too many GNS identity refreshes." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  try {
    const account = await getOrCreateGwapAccount(identity);
    const gnsIdentity = await resolveGnsIdentity(identity.verifiedWallet);

    if (gnsIdentity.status === "found" && gnsIdentity.name) {
      if (account.primaryGnsIdentity !== gnsIdentity.name) {
        await updateGwapAccountGnsIdentity(account.id, gnsIdentity.name);
      }
    } else if (gnsIdentity.status === "none" && account.primaryGnsIdentity) {
      await updateGwapAccountGnsIdentity(account.id, null);
    }

    return json({ identity: gnsIdentity });
  } catch {
    return json({ error: "GNS identity refresh is temporarily unavailable." }, 503);
  }
}
