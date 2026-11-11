import { NextResponse } from "next/server";
import { resolveGnsNameDetailed } from "../../../app/lib/gns";
import {
  isValidGnsName,
  normalizeGnsName,
} from "../../../app/lib/gns-registration";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit } from "../../../lib/request-guard";

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkRateLimit(`gns-resolve:${identity.userId}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many registry checks. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const name = normalizeGnsName(url.searchParams.get("name") || "");
  if (!isValidGnsName(name)) {
    return NextResponse.json(
      { error: "Use 1–32 lowercase letters, numbers, or internal hyphens." },
      { status: 400 },
    );
  }

  const result = await resolveGnsNameDetailed(name);
  if (!result.ok) {
    // Never infer availability from a failed lookup. `retryable` tells the
    // client this is transient (a cold or busy registry), not a bad request.
    return NextResponse.json(
      {
        error: "GNS registry is temporarily unavailable.",
        reason: result.reason,
        retryable: true,
      },
      {
        status: 503,
        headers: {
          "Retry-After": "3",
          "X-GNS-Failure": result.reason,
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json({
    name,
    fullName: `${name}.gwap`,
    available: result.value.found !== true,
    owner: result.value.found === true ? result.value.owner : null,
  });
}
