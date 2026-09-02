import "server-only";

import { NextResponse } from "next/server";
import {
  getGnsProfileUrl,
  resolveGnsIdentity,
  resolveGnsName,
} from "../app/lib/gns";
import type { GwapAccountRecord } from "./gwap-account-core.ts";
import type { WalletIdentity } from "./privy-server.ts";
import type { WorkspaceRedis } from "./redis.ts";
import { getPublicLookupSubject } from "./public-lookup.ts";
import { checkRateLimit } from "./request-guard.ts";
import {
  isExactResolvable,
  ownerAddress,
  parseFeatureFlag,
  resolvePrimaryRoute,
  toPublicProject,
  type GwapAddress,
  type GwapBrowserPublicProject,
  type GwapBrowserPublication,
} from "./gwap-browser-core.ts";
import {
  normalizeOwnerGnsName,
  revalidatePublicationOwnership,
  verifyLiveGnsOwnership,
  type GnsNameResolver,
  type OwnershipCheck,
} from "./gwap-browser-ownership.ts";
import {
  findOwnerRoute,
  findPublicationByAddress,
  readRegistry,
  refreshOwnershipProof,
  suspendPublication,
} from "./gwap-browser-registry.ts";

// ---------------------------------------------------------------------------
// Feature flags — server-authoritative. The UI may explain unavailability,
// but the API routes are the final enforcement point.
// ---------------------------------------------------------------------------

export function gwapBrowserFlags() {
  const enabled = parseFeatureFlag(process.env.GWAP_BROWSER_ENABLED);
  const publishEnabled = enabled && parseFeatureFlag(process.env.GWAP_BROWSER_PUBLISH_ENABLED);
  return { enabled, publishEnabled };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Public-safe JSON: never cached, never indexed. */
export function browserJson(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
      ...headers,
    },
  });
}

export function browserDisabledResponse() {
  return browserJson(
    { error: "Gwap Browser is not enabled on this deployment yet.", code: "browser_disabled" },
    503,
  );
}

/**
 * Rate limit keyed on the hardened public IP subject. Storage failures fail
 * closed with 503 rather than letting an unmetered burst through.
 */
export async function checkPublicBrowserRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
) {
  try {
    const subject = getPublicLookupSubject(request.headers);
    const rate = await checkRateLimit(`gwap-browser-${scope}:${subject}`, limit, windowMs);
    if (rate.allowed) return null;
    return browserJson({ error: "Too many requests", code: "rate_limited" }, 429, {
      "Retry-After": String(rate.retryAfter),
    });
  } catch {
    return browserJson(
      { error: "Gwap Browser protection is temporarily unavailable.", code: "temporarily_unavailable" },
      503,
    );
  }
}

// ---------------------------------------------------------------------------
// GNS ownership — live resolver wiring
// ---------------------------------------------------------------------------

export const liveGnsNameResolver: GnsNameResolver = (name) => resolveGnsName(name);

/**
 * Establishes the authenticated caller's live GNS ownership for publishing.
 * The intended name comes from the canonical GWAP account (falling back to a
 * live identity lookup when the cache is empty); authority always comes from
 * the live `/resolve` owner matching the authenticated verified wallet.
 */
export async function verifyPublisherGnsOwnership(
  identity: WalletIdentity,
  account: GwapAccountRecord,
): Promise<OwnershipCheck> {
  let name = normalizeOwnerGnsName(account.primaryGnsIdentity);
  if (!name) {
    try {
      const live = await resolveGnsIdentity(identity.verifiedWallet, { timeoutMs: 4_000 });
      if (live.status === "unavailable") return { ok: false, reason: "unavailable" };
      name = normalizeOwnerGnsName(live.name);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
  return verifyLiveGnsOwnership(liveGnsNameResolver, { name, wallet: identity.verifiedWallet });
}

export function describeOwnershipFailure(reason: Exclude<OwnershipCheck, { ok: true }>["reason"]) {
  switch (reason) {
    case "no_name":
      return "Claim a .gwap identity before publishing.";
    case "not_found":
      return "Your .gwap name could not be found in the GNS registry.";
    case "mismatch":
      return "The GNS registry lists a different wallet as the owner of that .gwap name.";
    case "unavailable":
    default:
      return "GNS ownership could not be verified right now. Try again shortly.";
  }
}

export function ownershipFailureStatus(reason: Exclude<OwnershipCheck, { ok: true }>["reason"]) {
  return reason === "unavailable" ? 503 : 409;
}

// ---------------------------------------------------------------------------
// Exact address resolution
// ---------------------------------------------------------------------------

export type BrowserResolution =
  | {
      kind: "profile";
      address: string;
      owner: string;
      ownerAddress: string;
      profileAddress: string;
      profileUrl: string | null;
      reason: "default" | "explicit" | "invalid_project" | "profile_label";
    }
  | {
      kind: "project";
      address: string;
      project: GwapBrowserPublicProject;
      target: { url: string; host: string };
      ownershipVerifiedAt: string;
      primaryAlias: boolean;
    }
  | { kind: "not_found"; address: string }
  | { kind: "temporarily_unavailable"; address: string };

type ProjectOpen =
  | { state: "open"; verifiedAt: string }
  | { state: "moved" }
  | { state: "unavailable" };

/** Applies the ownership TTL before a project may open; suspends on transfer. */
async function checkProjectOpen(
  redis: WorkspaceRedis,
  resolver: GnsNameResolver,
  publication: GwapBrowserPublication,
  now: number,
): Promise<ProjectOpen> {
  const result = await revalidatePublicationOwnership(resolver, publication, { now });
  if (result.outcome === "fresh") return { state: "open", verifiedAt: publication.ownershipVerifiedAt };
  if (result.outcome === "verified") {
    // Best-effort persistence: a busy lease must not block an already-verified open.
    await refreshOwnershipProof(redis, { publicationId: publication.id, verifiedAt: result.verifiedAt }).catch(() => false);
    return { state: "open", verifiedAt: result.verifiedAt };
  }
  if (result.outcome === "moved") {
    await suspendPublication(redis, { publicationId: publication.id }).catch(() => null);
    return { state: "moved" };
  }
  return { state: "unavailable" };
}

async function resolveProfile(
  resolver: GnsNameResolver,
  owner: string,
  address: string,
  reason: Extract<BrowserResolution, { kind: "profile" }>["reason"],
): Promise<BrowserResolution> {
  let resolution: Awaited<ReturnType<GnsNameResolver>>;
  try {
    resolution = await resolver(owner);
  } catch {
    resolution = null;
  }
  if (!resolution) return { kind: "temporarily_unavailable", address };
  if (resolution.found !== true) return { kind: "not_found", address };
  return {
    kind: "profile",
    address,
    owner,
    ownerAddress: ownerAddress(owner),
    profileAddress: `profile.${owner}.gwap`,
    profileUrl: getGnsProfileUrl(owner),
    reason,
  };
}

function projectResolution(
  publication: GwapBrowserPublication,
  address: string,
  verifiedAt: string,
  primaryAlias: boolean,
): BrowserResolution {
  const project = toPublicProject(publication);
  return {
    kind: "project",
    address,
    project,
    target: { url: publication.deploymentUrl, host: project.deploymentHost },
    ownershipVerifiedAt: verifiedAt,
    primaryAlias,
  };
}

/**
 * Resolves an exact `.gwap` address against the registry + live GNS.
 * Never redirects: callers render an interstitial and the user opens the
 * HTTPS target deliberately.
 */
export async function resolveBrowserAddress(
  redis: WorkspaceRedis,
  address: GwapAddress,
  options: { resolver?: GnsNameResolver; now?: number } = {},
): Promise<BrowserResolution> {
  const resolver = options.resolver ?? liveGnsNameResolver;
  const now = options.now ?? Date.now();

  if (address.kind === "profile") {
    return resolveProfile(resolver, address.owner, address.address, "profile_label");
  }

  const registry = await readRegistry(redis);

  if (address.kind === "project") {
    const publication = findPublicationByAddress(registry, address.owner, address.slug);
    if (!publication || !isExactResolvable(publication)) return { kind: "not_found", address: address.address };
    const open = await checkProjectOpen(redis, resolver, publication, now);
    if (open.state === "open") return projectResolution(publication, address.address, open.verifiedAt, false);
    if (open.state === "unavailable") return { kind: "temporarily_unavailable", address: address.address };
    return { kind: "not_found", address: address.address };
  }

  // owner.gwap → Profile by default, or the owner's chosen primary project.
  const route = resolvePrimaryRoute(address.owner, findOwnerRoute(registry, address.owner), registry.publications);
  if (route.mode === "project") {
    const open = await checkProjectOpen(redis, resolver, route.publication, now);
    if (open.state === "open") return projectResolution(route.publication, address.address, open.verifiedAt, true);
    if (open.state === "unavailable") return { kind: "temporarily_unavailable", address: address.address };
    return resolveProfile(resolver, address.owner, address.address, "invalid_project");
  }
  return resolveProfile(resolver, address.owner, address.address, route.reason);
}
