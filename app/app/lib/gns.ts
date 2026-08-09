import "server-only";

import type { GnsIdentity } from "./os-state";

const DEFAULT_GNS_API_URL = "https://gns-backend-zh4o.onrender.com/api";
const GNS_LOOKUP_TIMEOUT_MS = 2_500;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getApiBase() {
  return (process.env.GNS_API_URL || DEFAULT_GNS_API_URL).replace(/\/+$/, "");
}

function getProfileBase() {
  return (
    process.env.NEXT_PUBLIC_GNS_PROFILE_BASE_URL || "https://gwapspot.fun"
  ).replace(/\/+$/, "");
}

function emptyIdentity(status: GnsIdentity["status"]): GnsIdentity {
  return {
    status,
    name: null,
    fullName: null,
    avatar: null,
    bio: null,
    score: null,
    scoreTier: null,
    verified: false,
    isGenesis: false,
    tier: null,
    profileUrl: null,
    updatedAt: null,
  };
}

function identityFromDomain(domain: UnknownRecord): GnsIdentity {
  const name = asString(domain.name);
  const fullName = asString(domain.full_name) || (name ? `${name}.gwap` : null);

  return {
    status: "found",
    name,
    fullName,
    avatar: asString(domain.avatar),
    bio: null,
    score: null,
    scoreTier: null,
    verified: false,
    isGenesis: asBoolean(domain.is_genesis),
    tier: domain.tier === "premium" || domain.tier === "free" ? domain.tier : null,
    profileUrl: name ? `${getProfileBase()}/${encodeURIComponent(name)}` : null,
    updatedAt: null,
  };
}

export async function resolveGnsIdentity(wallet: string): Promise<GnsIdentity> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GNS_LOOKUP_TIMEOUT_MS);
  const apiBase = getApiBase();

  try {
    const domainsResponse = await fetch(
      `${apiBase}/domains/${encodeURIComponent(wallet)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );

    if (!domainsResponse.ok) return emptyIdentity("unavailable");

    const domainsPayload = asRecord(await domainsResponse.json());
    const domains = Array.isArray(domainsPayload?.domains)
      ? domainsPayload.domains
          .map(asRecord)
          .filter((domain): domain is UnknownRecord => Boolean(domain))
      : [];
    const activeDomains = domains.filter((domain) => domain.status !== "expired");
    const primary =
      activeDomains.find((domain) => domain.is_primary === true) || activeDomains[0];

    if (!primary) return emptyIdentity("none");

    const baseIdentity = identityFromDomain(primary);
    if (!baseIdentity.name) return emptyIdentity("none");

    try {
      const profileResponse = await fetch(
        `${apiBase}/profile/${encodeURIComponent(baseIdentity.name)}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );

      if (!profileResponse.ok) return baseIdentity;

      const profile = asRecord(await profileResponse.json());
      if (!profile) return baseIdentity;

      return {
        ...baseIdentity,
        fullName: asString(profile.full_name) || baseIdentity.fullName,
        avatar: asString(profile.avatar) || baseIdentity.avatar,
        bio: asString(profile.bio),
        score: asNumber(profile.score),
        scoreTier: asString(profile.score_tier),
        verified: asBoolean(profile.verified),
        isGenesis: asBoolean(profile.is_genesis) || baseIdentity.isGenesis,
        tier:
          profile.tier === "premium" || profile.tier === "free"
            ? profile.tier
            : baseIdentity.tier,
        updatedAt: asString(profile.updated_at),
      };
    } catch {
      return baseIdentity;
    }
  } catch {
    return emptyIdentity("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export function getGnsApiBase() {
  return getApiBase();
}
