import {
  GWAP_BROWSER_OWNERSHIP_TTL_MS,
  OWNER_NAME_PATTERN,
  isOwnershipProofFresh,
  type GwapBrowserPublication,
} from "./gwap-browser-core.ts";

// ---------------------------------------------------------------------------
// Live GNS ownership verification — pure over an injected resolver so the
// fail-closed rules are unit-tested without network access. The server wires
// `resolver` to the existing server-side GNS `/resolve` client.
//
// Publishing authority comes from the live GNS owner, never from a cached
// account field or client state. Every ownership-sensitive mutation and every
// stale exact resolution goes through here.
// ---------------------------------------------------------------------------

export type GnsResolution = { found: boolean; owner: string | null } | null;
export type GnsNameResolver = (name: string) => Promise<GnsResolution>;

export type OwnershipFailure = "no_name" | "not_found" | "mismatch" | "unavailable";

export type OwnershipCheck =
  | { ok: true; name: string; wallet: string; verifiedAt: string }
  | { ok: false; reason: OwnershipFailure };

export function normalizeOwnerGnsName(raw: string | null | undefined) {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase().replace(/\.gwap$/, "");
  return OWNER_NAME_PATTERN.test(value) ? value : null;
}

/**
 * Requires `found === true` and the resolved owner to equal the authenticated
 * verified wallet. A missing name, a missing record, a different owner, or an
 * unavailable resolver all fail closed.
 */
export async function verifyLiveGnsOwnership(
  resolver: GnsNameResolver,
  input: { name: string | null | undefined; wallet: string; now?: string },
): Promise<OwnershipCheck> {
  const name = normalizeOwnerGnsName(input.name);
  if (!name) return { ok: false, reason: "no_name" };
  if (!input.wallet) return { ok: false, reason: "mismatch" };

  let resolution: GnsResolution;
  try {
    resolution = await resolver(name);
  } catch {
    resolution = null;
  }
  if (!resolution) return { ok: false, reason: "unavailable" };
  if (resolution.found !== true || !resolution.owner) return { ok: false, reason: "not_found" };
  if (resolution.owner !== input.wallet) return { ok: false, reason: "mismatch" };

  return { ok: true, name, wallet: input.wallet, verifiedAt: input.now ?? new Date().toISOString() };
}

export type RevalidationOutcome =
  | { outcome: "fresh" }
  | { outcome: "verified"; verifiedAt: string }
  | { outcome: "moved" }
  | { outcome: "unavailable" };

/**
 * Decides whether a publication may open right now.
 *   fresh       → proof within TTL, no network call
 *   verified    → live check passed; caller should persist `verifiedAt`
 *   moved       → the name no longer resolves to the recorded owner; suspend
 *   unavailable → GNS could not answer after the TTL; do not open
 */
export async function revalidatePublicationOwnership(
  resolver: GnsNameResolver,
  publication: Pick<GwapBrowserPublication, "ownerGnsName" | "ownerWallet" | "ownershipVerifiedAt">,
  options: { now?: number; ttlMs?: number } = {},
): Promise<RevalidationOutcome> {
  const now = options.now ?? Date.now();
  if (isOwnershipProofFresh(publication, now, options.ttlMs ?? GWAP_BROWSER_OWNERSHIP_TTL_MS)) {
    return { outcome: "fresh" };
  }
  const check = await verifyLiveGnsOwnership(resolver, {
    name: publication.ownerGnsName,
    wallet: publication.ownerWallet,
    now: new Date(now).toISOString(),
  });
  if (check.ok) return { outcome: "verified", verifiedAt: check.verifiedAt };
  if (check.reason === "unavailable") return { outcome: "unavailable" };
  return { outcome: "moved" };
}
