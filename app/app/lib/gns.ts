import "server-only";

import { PublicKey } from "@solana/web3.js";
import { buildGnsPublicProfileUrl } from "../../lib/gns-profile-url";
import type { GwapScoreResult } from "../../lib/gwap-score";
import {
  CANONICAL_GNS_PROGRAM_ID,
  CANONICAL_GNS_TREASURY,
  type GnsNetwork,
  type GnsRegistrationConfig,
} from "./gns-registration";
import type { GnsIdentity } from "./os-state";
import { fetchGwapScore } from "./gwap-score";

const DEFAULT_GNS_API_URL = "https://gns-backend-zh4o.onrender.com/api";
const GNS_LOOKUP_TIMEOUT_MS = 2_500;
const MAX_GNS_LOOKUP_TIMEOUT_MS = 10_000;
const GNS_CONFIG_TIMEOUT_MS = 4_000;
const GNS_REGISTER_TIMEOUT_MS = 18_000;

type UnknownRecord = Record<string, unknown>;

export type GnsMigrationState = {
  status:
    | "available"
    | "development-active"
    | "migration-eligible"
    | "reserved"
    | "mainnet-active";
  network: GnsNetwork | null;
  owner: string | null;
  migrationEligible: boolean;
};

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

function asMigrationStatus(value: unknown): GnsMigrationState["status"] | null {
  return value === "available" ||
    value === "development-active" ||
    value === "migration-eligible" ||
    value === "reserved" ||
    value === "mainnet-active"
    ? value
    : null;
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

export function getGnsProfileUrl(name: string) {
  return buildGnsPublicProfileUrl(name, {
    baseUrl: process.env.NEXT_PUBLIC_GNS_PROFILE_BASE_URL,
    pathTemplate: process.env.NEXT_PUBLIC_GNS_PROFILE_PATH_TEMPLATE,
  });
}

function emptyIdentity(
  status: GnsIdentity["status"],
  score: GwapScoreResult,
): GnsIdentity {
  return {
    status,
    name: null,
    fullName: null,
    avatar: null,
    bio: null,
    score: score.score,
    scoreTier: score.tier,
    scoreStatus: score.status,
    scoreMessage: score.message,
    verified: false,
    isGenesis: false,
    tier: null,
    profileUrl: null,
    updatedAt: null,
  };
}

function identityFromDomain(
  domain: UnknownRecord,
  score: GwapScoreResult,
): GnsIdentity {
  const name = asString(domain.name);
  const fullName = asString(domain.full_name) || (name ? `${name}.gwap` : null);

  return {
    status: "found",
    name,
    fullName,
    avatar: asString(domain.avatar),
    bio: null,
    score: score.score,
    scoreTier: score.tier,
    scoreStatus: score.status,
    scoreMessage: score.message,
    verified: false,
    isGenesis: asBoolean(domain.is_genesis),
    tier: domain.tier === "premium" || domain.tier === "free" ? domain.tier : null,
    profileUrl: name ? getGnsProfileUrl(name) : null,
    updatedAt: null,
  };
}

export async function resolveGnsIdentity(
  wallet: string,
  options: { timeoutMs?: number; scoreTimeoutMs?: number } = {},
): Promise<GnsIdentity> {
  const scorePromise = fetchGwapScore(wallet, {
    timeoutMs: options.scoreTimeoutMs,
  });
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

    if (!domainsResponse.ok) {
      return emptyIdentity("unavailable", await scorePromise);
    }

    const domainsPayload = asRecord(await domainsResponse.json());
    const domains = Array.isArray(domainsPayload?.domains)
      ? domainsPayload.domains
          .map(asRecord)
          .filter((domain): domain is UnknownRecord => Boolean(domain))
      : [];
    const activeDomains = domains.filter((domain) => domain.status !== "expired");
    const primary =
      activeDomains.find((domain) => domain.is_primary === true) || activeDomains[0];

    if (!primary) return emptyIdentity("none", await scorePromise);
    const name = asString(primary.name);
    if (!name) return emptyIdentity("none", await scorePromise);

    const profilePromise = fetch(
      `${apiBase}/profile/${encodeURIComponent(name)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    )
      .then(async (response) =>
        response.ok ? asRecord(await response.json()) : null,
      )
      .catch(() => null);
    const [score, profile] = await Promise.all([scorePromise, profilePromise]);
    const baseIdentity = identityFromDomain(primary, score);
    if (!profile) return baseIdentity;

    return {
      ...baseIdentity,
      fullName: asString(profile.full_name) || baseIdentity.fullName,
      avatar: asString(profile.avatar) || baseIdentity.avatar,
      bio: asString(profile.bio),
      verified: asBoolean(profile.verified),
      isGenesis: asBoolean(profile.is_genesis) || baseIdentity.isGenesis,
      tier:
        profile.tier === "premium" || profile.tier === "free"
          ? profile.tier
          : baseIdentity.tier,
      updatedAt: asString(profile.updated_at),
    };
  } catch {
    return emptyIdentity("unavailable", await scorePromise);
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

export async function getGnsMigrationStatus(
  name: string,
  owner: string,
): Promise<GnsMigrationState | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GNS_CONFIG_TIMEOUT_MS);

  try {
    const url = new URL(
      `${getApiBase()}/migration/${encodeURIComponent(name)}`,
    );
    url.searchParams.set("owner", owner);
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = asRecord(await response.json());
    const status = asMigrationStatus(payload?.status);
    if (!status) return null;
    const resolvedOwner = asString(payload?.owner);
    return {
      status,
      network: asNetwork(payload?.network),
      owner: resolvedOwner,
      migrationEligible:
        payload?.migration_eligible === true && resolvedOwner === owner,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
