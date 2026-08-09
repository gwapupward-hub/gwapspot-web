import { NextResponse } from "next/server";
import {
  resolveGnsIdentity,
  resolveGnsName,
} from "../../../app/lib/gns";
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

function getProfileUrl(name: string) {
  const base = (
    process.env.NEXT_PUBLIC_GNS_PROFILE_BASE_URL || "https://gwapspot.fun"
  ).replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(name)}`;
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

    return json({
      kind: "name",
      name: lookup.value,
      fullName: lookup.fullName,
      available: !resolved.found,
      owner: resolved.found ? resolved.owner : null,
      profileUrl: resolved.found ? getProfileUrl(lookup.value) : null,
    });
  }

  const identity = await resolveGnsIdentity(lookup.value, { timeoutMs: 7_500 });
  if (identity.status === "unavailable") {
    return json(
      { error: "Wallet intelligence is temporarily unavailable." },
      503,
    );
  }

  return json({
    kind: "wallet",
    wallet: lookup.value,
    identity: {
      status: identity.status,
      name: identity.name,
      fullName: identity.fullName,
      score: identity.score,
      scoreTier: identity.scoreTier,
      verified: identity.verified,
      profileUrl: identity.profileUrl,
    },
  });
}
