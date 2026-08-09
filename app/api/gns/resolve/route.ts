import { NextResponse } from "next/server";
import { getGnsApiBase } from "../../../app/lib/gns";
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);

  try {
    const response = await fetch(`${getGnsApiBase()}/resolve/${encodeURIComponent(name)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("GNS registry unavailable");

    const payload = (await response.json()) as { found?: boolean; owner?: string | null };
    return NextResponse.json({
      name,
      fullName: `${name}.gwap`,
      available: payload.found !== true,
      owner: payload.found === true ? payload.owner ?? null : null,
    });
  } catch {
    return NextResponse.json(
      { error: "GNS registry is temporarily unavailable." },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
