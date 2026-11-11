import "server-only";

import { PublicKey } from "@solana/web3.js";
import { buildGnsPublicProfileUrl } from "../../lib/gns-profile-url";
import type { GwapScoreResult } from "../../lib/gwap-score";
import {
  CANONICAL_GNS_PROGRAM_ID,
  CANONICAL_GNS_TREASURY,
  GNS_REGISTRATION_NETWORK,
  assertGnsRegistrationNetwork,
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
// Read-only registry lookups. The backend can be cold (a sleeping instance
// takes tens of seconds to boot), so a lookup retries transient failures
// within a bounded budget instead of failing on the first slow answer.
const GNS_RESOLVE_ATTEMPT_TIMEOUT_MS = 6_000;
const GNS_RESOLVE_BUDGET_MS = 12_000;
const GNS_RETRY_BACKOFF_MS = [300, 900];
const GNS_RETRYABLE_STATUS = new Set([502, 503, 504]);
const GNS_WARM_TIMEOUT_MS = 1_500;

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

export type GnsRegistryFailureReason =
  | "timeout"
  | "network"
  | "upstream_5xx"
  | "upstream_4xx"
  | "invalid_payload";

export type GnsRegistryFailure = {
  ok: false;
  reason: GnsRegistryFailureReason;
  status: number | null;
  attempts: number;
  elapsedMs: number;
};

export type GnsRegistryResult<T> =
  | { ok: true; value: T; attempts: number; elapsedMs: number }
  | GnsRegistryFailure;

/** Fixed operation labels: diagnostics never carry names, wallets or URLs. */
export type GnsRegistryOperation =
  | "resolve_name"
  | "domains_by_wallet"
  | "profile_by_name";

export type GnsRegistryFetchOptions = {
  attemptTimeoutMs?: number;
  budgetMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function logRegistryFailure(op: GnsRegistryOperation, failure: GnsRegistryFailure) {
  // A missing record is an answer, not an outage.
  if (failure.status === 404) return;
  console.warn("gns_registry_lookup_failed", {
    op,
    reason: failure.reason,
    status: failure.status,
    attempts: failure.attempts,
    elapsedMs: failure.elapsedMs,
  });
}

/**
 * GET a read-only GNS registry path. Network errors, timeouts and 502/503/504
 * are retried with short backoff inside `budgetMs`; any other status, and any
 * 200 whose body is not a JSON object, fails immediately. Failures are never
 * converted into an answer — callers decide what "unavailable" means.
 */
export async function fetchGnsRegistry<T>(
  op: GnsRegistryOperation,
  path: string,
  parse: (payload: UnknownRecord) => T | null,
  options: GnsRegistryFetchOptions = {},
): Promise<GnsRegistryResult<T>> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? GNS_RESOLVE_ATTEMPT_TIMEOUT_MS;
  const budgetMs = options.budgetMs ?? GNS_RESOLVE_BUDGET_MS;
  const started = Date.now();
  const url = `${getApiBase()}${path}`;
  let attempts = 0;
  let reason: GnsRegistryFailureReason = "timeout";
  let status: number | null = null;

  while (true) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining <= 0) break;
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(attemptTimeoutMs, remaining));
    let retryable = false;

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      status = response.status;
      if (response.ok) {
        let value: T | null = null;
        try {
          const record = asRecord(await response.json());
          value = record ? parse(record) : null;
        } catch {
          if (controller.signal.aborted) {
            reason = "timeout";
            retryable = true;
          }
        }
        if (value !== null) {
          return { ok: true, value, attempts, elapsedMs: Date.now() - started };
        }
        if (!retryable) reason = "invalid_payload";
      } else {
        reason = response.status >= 500 ? "upstream_5xx" : "upstream_4xx";
        retryable = GNS_RETRYABLE_STATUS.has(response.status);
      }
    } catch {
      status = null;
      reason = controller.signal.aborted ? "timeout" : "network";
      retryable = true;
    } finally {
      clearTimeout(timer);
    }

    const backoff = GNS_RETRY_BACKOFF_MS[attempts - 1];
    if (!retryable || backoff === undefined) break;
    if (Date.now() - started + backoff >= budgetMs) break;
    await sleep(backoff);
  }

  const failure: GnsRegistryFailure = {
    ok: false,
    reason,
    status,
    attempts,
    elapsedMs: Date.now() - started,
  };
  logRegistryFailure(op, failure);
  return failure;
}

/**
 * Nudge a sleeping registry instance awake. Arrival of the request is what
 * starts the boot, so this does not wait for the instance to become ready.
 */
export async function warmGnsRegistry() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GNS_WARM_TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiBase()}/readiness`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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
    resolutionSource: status === "none" ? "none" : "unavailable",
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
    resolutionSource: "registry",
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
  const requestedTimeout = options.timeoutMs ?? GNS_LOOKUP_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(requestedTimeout, 1_000), MAX_GNS_LOOKUP_TIMEOUT_MS)
    : GNS_LOOKUP_TIMEOUT_MS;

  const domainsResult = await fetchGnsRegistry(
    "domains_by_wallet",
    `/domains/${encodeURIComponent(wallet)}`,
    (payload) =>
      Array.isArray(payload.domains)
        ? payload.domains
            .map(asRecord)
            .filter((domain): domain is UnknownRecord => Boolean(domain))
        : [],
    // One timeout-length attempt, plus a retry for fast transient failures.
    { attemptTimeoutMs: timeoutMs, budgetMs: Math.min(timeoutMs * 2, MAX_GNS_LOOKUP_TIMEOUT_MS) },
  );
  if (!domainsResult.ok) return emptyIdentity("unavailable", await scorePromise);

  const activeDomains = domainsResult.value.filter((domain) => domain.status !== "expired");
  const primary =
    activeDomains.find((domain) => domain.is_primary === true) || activeDomains[0];

  if (!primary) return emptyIdentity("none", await scorePromise);
  const name = asString(primary.name);
  if (!name) return emptyIdentity("none", await scorePromise);

  const profilePromise = fetchGnsRegistry(
    "profile_by_name",
    `/profile/${encodeURIComponent(name)}`,
    (payload) => payload,
    { attemptTimeoutMs: timeoutMs, budgetMs: timeoutMs },
  ).then((result) => (result.ok ? result.value : null));
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

export class GnsRegistrationConfigError extends GnsApiError {
  constructor() {
    super("GNS registration is unavailable until its devnet configuration is verified.", 503);
    this.name = "GnsRegistrationConfigError";
  }
}

export async function getGnsRegistrationConfig(): Promise<GnsRegistrationConfig> {
  // An environment override cannot authorize a GNS mainnet release.
  assertGnsRegistrationNetwork(
    process.env.GNS_EXPECTED_NETWORK?.trim() || GNS_REGISTRATION_NETWORK,
  );
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

    if (
      payload?.on_chain_mode !== true ||
      !programId ||
      !treasury ||
      !network ||
      !feeLamports ||
      !Number.isSafeInteger(feeLamports) ||
      feeLamports <= 0 ||
      feeLamports > 1_000_000_000 ||
      !isPublicKey(programId) ||
      !isPublicKey(treasury) ||
      programId !== expectedProgramId ||
      treasury !== expectedTreasury ||
      network !== GNS_REGISTRATION_NETWORK
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
  // Revalidate on receipt submission, including retries after config drift.
  // Callers must not turn a configuration failure into recovered ownership.
  try {
    await getGnsRegistrationConfig();
  } catch {
    throw new GnsRegistrationConfigError();
  }
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

export type GnsNameResolution = { found: boolean; owner: string | null };

/** Name -> owner with the failure reason preserved for diagnostics and retries. */
export function resolveGnsNameDetailed(
  name: string,
  options: GnsRegistryFetchOptions = {},
): Promise<GnsRegistryResult<GnsNameResolution>> {
  return fetchGnsRegistry(
    "resolve_name",
    `/resolve/${encodeURIComponent(name)}`,
    // `found` must be an explicit boolean: an ambiguous body is not "available".
    (payload) =>
      typeof payload.found === "boolean"
        ? { found: payload.found, owner: asString(payload.owner) }
        : null,
    options,
  );
}

export async function resolveGnsName(
  name: string,
  options: GnsRegistryFetchOptions = {},
): Promise<GnsNameResolution | null> {
  const result = await resolveGnsNameDetailed(name, options);
  return result.ok ? result.value : null;
}
