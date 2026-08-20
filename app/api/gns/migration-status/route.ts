import { NextResponse } from "next/server";
import { getGnsApiBase } from "../../../app/lib/gns";
import {
  isValidGnsName,
  normalizeGnsName,
} from "../../../app/lib/gns-registration";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit } from "../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_TIMEOUT_MS = 4_000;

type MigrationStatus =
  | "available"
  | "development-active"
  | "migration-eligible"
  | "reserved"
  | "mainnet-active";

type MigrationPayload = {
  name?: unknown;
  full_name?: unknown;
  status?: unknown;
  network?: unknown;
  owner?: unknown;
  migration_eligible?: unknown;
};

function isMigrationStatus(value: unknown): value is MigrationStatus {
  return (
    value === "available" ||
    value === "development-active" ||
    value === "migration-eligible" ||
    value === "reserved" ||
    value === "mainnet-active"
  );
}

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit(`gns-migration:${identity.userId}`, 30, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many migration checks. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
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
  const timeout = setTimeout(() => controller.abort(), MIGRATION_TIMEOUT_MS);

  try {
    const upstream = new URL(
      `${getGnsApiBase()}/migration/${encodeURIComponent(name)}`,
    );
    upstream.searchParams.set("owner", identity.verifiedWallet);
    const response = await fetch(upstream, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    // Older/devnet GNS deployments do not expose migration state. Treat that
    // as a dormant feature rather than breaking the authenticated OS.
    if (response.status === 404) {
      return NextResponse.json(
        { status: "unsupported", name, fullName: `${name}.gwap` },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    if (!response.ok) throw new Error("GNS migration state unavailable");

    const payload = (await response.json()) as MigrationPayload;
    if (!isMigrationStatus(payload.status)) {
      throw new Error("GNS migration state was invalid");
    }

    const owner = typeof payload.owner === "string" ? payload.owner : null;
    const network =
      payload.network === "devnet" ||
      payload.network === "testnet" ||
      payload.network === "mainnet-beta"
        ? payload.network
        : null;

    return NextResponse.json(
      {
        status: payload.status,
        name,
        fullName:
          typeof payload.full_name === "string" && payload.full_name.trim()
            ? payload.full_name.trim()
            : `${name}.gwap`,
        network,
        owner,
        migrationEligible:
          payload.migration_eligible === true && owner === identity.verifiedWallet,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "GNS migration status is temporarily unavailable." },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
