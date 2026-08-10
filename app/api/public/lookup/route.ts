import { NextResponse } from "next/server";
import {
  getGnsProfileUrl,
  resolveGnsIdentity,
  resolveGnsName,
} from "../../../app/lib/gns";
import { fetchGwapScore } from "../../../app/lib/gwap-score";
import {
  getPublicLookupSubject,
  isPublicLookupMode,
  normalizePublicLookup,
  PublicLookupValidationError,
} from "../../../lib/public-lookup";
import { checkRateLimit } from "../../../lib/request-guard";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...responseHeaders, ...headers },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("type");

  if (!isPublicLookupMode(mode)) {
    return json({ error: "Choose Wallet Intelligence or .GWAP Name." }, 400);
  }

  let lookup;
  try {
    lookup = normalizePublicLookup(mode, url.searchParams.get("q") || "");
  } catch (error) {
    const message =
      error instanceof PublicLookupValidationError
        ? error.message
        : "That lookup could not be validated.";
    return json({ error: message }, 400);
  }

  let rateLimit;
  try {
    rateLimit = await checkRateLimit(
      `public-lookup:${getPublicLookupSubject(request.headers)}`,
      20,
      60_000,
    );
  } catch {
    return json(
      { error: "Public lookup protection is temporarily unavailable." },
      503,
    );
  }

  if (!rateLimit.allowed) {
    return json(
      { error: "Too many lookups. Try again shortly." },
      429,
      { "Retry-After": String(rateLimit.retryAfter) },
    );
  }

  if (lookup.mode === "name") {
    const resolved = await resolveGnsName(lookup.value);
    if (!resolved) {
      return json({ error: "The GNS registry is temporarily unavailable." }, 503);
    }

    if (resolved.found && !resolved.owner) {
      return json({ error: "The registered name has no valid owner." }, 502);
    }

    const score = resolved.owner
      ? await fetchGwapScore(resolved.owner, { timeoutMs: 12_000 })
      : null;

    return json({
      kind: "name",
      name: lookup.value,
      fullName: lookup.fullName,
      available: !resolved.found,
      owner: resolved.found ? resolved.owner : null,
      profileUrl: resolved.found ? getGnsProfileUrl(lookup.value) : null,
      score,
    });
  }

  const identity = await resolveGnsIdentity(lookup.value, {
    timeoutMs: 7_500,
    scoreTimeoutMs: 12_000,
  });

  return json({
    kind: "wallet",
    wallet: lookup.value,
    identity: {
      status: identity.status,
      name: identity.name,
      fullName: identity.fullName,
      score: identity.score,
      scoreTier: identity.scoreTier,
      scoreStatus: identity.scoreStatus,
      scoreMessage: identity.scoreMessage,
      verified: identity.verified,
      profileUrl: identity.profileUrl,
    },
  });
}
