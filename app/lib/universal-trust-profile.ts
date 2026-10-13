import "server-only";

import { getGnsApiBase } from "../app/lib/gns";
import {
  isValidGnsProfileName,
  normalizeGnsProfileName,
  normalizeGnsPublicProfile,
  type GnsPublicProfile,
} from "../app/lib/gns-profile";

const TRUST_PROFILE_TIMEOUT_MS = 6_000;

export type UniversalTrustProfileResult =
  | { status: "found"; profile: GnsPublicProfile }
  | { status: "not_found"; profile: null }
  | { status: "unavailable"; profile: null };

export function buildUniversalTrustProfilePath(name: string) {
  const normalized = normalizeGnsProfileName(name);
  return isValidGnsProfileName(normalized)
    ? `/profile/${encodeURIComponent(normalized)}`
    : null;
}

export async function getUniversalTrustProfile(
  rawName: string,
): Promise<UniversalTrustProfileResult> {
  const name = normalizeGnsProfileName(rawName);
  if (!isValidGnsProfileName(name)) {
    return { status: "not_found", profile: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRUST_PROFILE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${getGnsApiBase()}/profile/${encodeURIComponent(name)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );

    if (response.status === 404) {
      return { status: "not_found", profile: null };
    }
    if (!response.ok) {
      return { status: "unavailable", profile: null };
    }

    const profile = normalizeGnsPublicProfile(await response.json());
    if (!profile || profile.name !== name) {
      return { status: "not_found", profile: null };
    }

    return { status: "found", profile };
  } catch {
    return { status: "unavailable", profile: null };
  } finally {
    clearTimeout(timeout);
  }
}
