import "server-only";

import { PublicKey } from "@solana/web3.js";
import {
  CANONICAL_GNS_PROGRAM_ID,
  CANONICAL_GNS_TREASURY,
  type GnsNetwork,
  type GnsRegistrationConfig,
} from "./gns-registration";
import type { GnsIdentity } from "./os-state";

const DEFAULT_GNS_API_URL = "https://gns-backend-zh4o.onrender.com/api";
const GNS_LOOKUP_TIMEOUT_MS = 2_500;
const MAX_GNS_LOOKUP_TIMEOUT_MS = 10_000;
const GNS_CONFIG_TIMEOUT_MS = 4_000;
const GNS_REGISTER_TIMEOUT_MS = 18_000;

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

function asNetwork(value: unknown): GnsNetwork | null {
  if (value === "devnet" || value === "testnet" || value === "mainnet-beta") {
    return value;
  }
  return value === "mainnet" ? "mainnet-beta" : null;
}

function isPublicKey(value: string) {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
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

export async function resolveGnsIdentity(
  wallet: string,
  options: { timeoutMs?: number } = {},
): Promise<GnsIdentity> {
  const controller = new AbortController();
  const requestedTimeout = options.timeoutMs ?? GNS_LOOKUP_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(requestedTimeout, 1_000), MAX_GNS_LOOKUP_TIMEOUT_MS)
    : GNS_LOOKUP_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

export class GnsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GnsApiError";
  }
}

export async function getGnsRegistrationConfig(): Promise<GnsRegistrationConfig> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GNS_CONFIG_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBase()}/config`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("GNS configuration unavailable");

    const payload = asRecord(await response.json());
    const programId = asString(payload?.program_id);
    const treasury = asString(payload?.treasury);
    const network = asNetwork(payload?.network);
    const feeLamports = asNumber(payload?.fee_lamports);
    const expectedProgramId =
      process.env.GNS_EXPECTED_PROGRAM_ID?.trim() || CANONICAL_GNS_PROGRAM_ID;
    const expectedTreasury =
      process.env.GNS_EXPECTED_TREASURY_PUBKEY?.trim() ||
      CANONICAL_GNS_TREASURY;
    const expectedNetwork = asNetwork(
      process.env.GNS_EXPECTED_NETWORK?.trim() || "devnet",
    );

    if (
      payload?.on_chain_mode !== true ||
      !programId ||
      !treasury ||
      !network ||
      !feeLamports ||
      !Number.isSafeInteger(feeLamports) ||
      feeLamports > 1_000_000_000 ||
      !isPublicKey(programId) ||
      !isPublicKey(treasury) ||
      programId !== expectedProgramId ||
      treasury !== expectedTreasury ||
      network !== expectedNetwork
    ) {
      throw new Error("GNS deployment configuration failed validation");
    }

    return {
      feeLamports,
      feeSol: feeLamports / 1_000_000_000,
      network,
      onChainMode: true,
      programId,
      treasury,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function registerGnsIdentity({
  name,
  owner,
  txSignature,
}: {
  name: string;
  owner: string;
  txSignature: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GNS_REGISTER_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBase()}/register`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        owner,
        tx_signature: txSignature,
        referrer: null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message =
        response.status === 409
          ? "That .gwap name has already been registered."
          : response.status === 400
            ? "GNS rejected the confirmed transaction receipt."
            : "GNS could not record the confirmed transaction.";
      throw new GnsApiError(message, response.status);
    }

    return asRecord(await response.json());
  } catch (error) {
    if (error instanceof GnsApiError) throw error;
    throw new GnsApiError("GNS receipt verification is temporarily unavailable.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveGnsName(name: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GNS_CONFIG_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${getApiBase()}/resolve/${encodeURIComponent(name)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;

    const payload = asRecord(await response.json());
    return {
      found: payload?.found === true,
      owner: asString(payload?.owner),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
