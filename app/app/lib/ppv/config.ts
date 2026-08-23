import { PublicKey, clusterApiUrl } from "@solana/web3.js";

/**
 * PPV Foundation is devnet-only. The cluster is not configurable to anything
 * else here: shipping a mainnet PPV surface is a separate gate (see the PPV
 * repo's docs/deployment-gates.md), not an environment variable.
 */
export const PPV_CLUSTER = "devnet" as const;

export type PpvConfig = {
  cluster: typeof PPV_CLUSTER;
  coreProgramId: PublicKey;
  commerceProgramId: PublicKey;
  rpcUrl: string;
};

export class PpvConfigError extends Error {
  readonly problems: readonly string[];

  constructor(message: string, problems: readonly string[]) {
    super(message);
    this.name = "PpvConfigError";
    this.problems = problems;
  }
}

// Placeholder IDs from the PPV repository's build-only `declare_id!` values.
// They compile but were never deployed, so treating one as configuration would
// point the UI at an address that does not exist on devnet.
const BUILD_ONLY_PLACEHOLDER_IDS = new Set([
  "Dkujj5vZp8kxhqM6hQTqqV3sTQ4Rx7J77No4bfwjrfXp",
  "4Y83YzUZnJ5LF9M1PcKHtsYcQ1LRxedwDi93PVf5H1FJ",
]);

function readProgramId(
  name: string,
  raw: string | undefined,
  problems: string[],
): PublicKey | null {
  const value = raw?.trim();
  if (!value) {
    problems.push(`${name} is not set`);
    return null;
  }
  if (BUILD_ONLY_PLACEHOLDER_IDS.has(value)) {
    problems.push(`${name} is a build-only placeholder that was never deployed`);
    return null;
  }

  try {
    return new PublicKey(value);
  } catch {
    problems.push(`${name} is not a valid base58 public key`);
    return null;
  }
}

function readRpcUrl(problems: string[]): string {
  const configured = process.env.NEXT_PUBLIC_PPV_RPC_URL?.trim();
  if (!configured) return clusterApiUrl(PPV_CLUSTER);

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    problems.push("NEXT_PUBLIC_PPV_RPC_URL is not a valid URL");
    return clusterApiUrl(PPV_CLUSTER);
  }
  if (url.protocol !== "https:") {
    problems.push("NEXT_PUBLIC_PPV_RPC_URL must use https");
  }
  if (url.username || url.password || url.searchParams.has("api-key")) {
    // A browser-visible endpoint is public by definition. Anything carrying a
    // credential belongs behind the server-only SOLANA_RPC_URL instead.
    problems.push(
      "NEXT_PUBLIC_PPV_RPC_URL must not embed a credential; use an origin-restricted endpoint",
    );
  }
  return configured;
}

let cached: PpvConfig | null = null;
let cachedError: PpvConfigError | null = null;

/**
 * Resolve the PPV devnet configuration, or throw with the exact list of what is
 * wrong. There is deliberately no fallback and no partial mode: a PPV surface
 * that cannot name both deployed programs must not render at all, because every
 * downstream state would be indistinguishable from "nothing recorded on chain".
 */
export function getPpvConfig(): PpvConfig {
  if (cached) return cached;
  if (cachedError) throw cachedError;

  const problems: string[] = [];

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim();
  if (cluster && cluster !== PPV_CLUSTER) {
    problems.push(
      `NEXT_PUBLIC_SOLANA_CLUSTER is "${cluster}" but PPV Foundation runs on ${PPV_CLUSTER} only`,
    );
  }

  const coreProgramId = readProgramId(
    "NEXT_PUBLIC_PPV_CORE_PROGRAM_ID",
    process.env.NEXT_PUBLIC_PPV_CORE_PROGRAM_ID,
    problems,
  );
  const commerceProgramId = readProgramId(
    "NEXT_PUBLIC_PPV_COMMERCE_PROGRAM_ID",
    process.env.NEXT_PUBLIC_PPV_COMMERCE_PROGRAM_ID,
    problems,
  );

  if (
    coreProgramId &&
    commerceProgramId &&
    coreProgramId.equals(commerceProgramId)
  ) {
    problems.push(
      "NEXT_PUBLIC_PPV_CORE_PROGRAM_ID and NEXT_PUBLIC_PPV_COMMERCE_PROGRAM_ID are the same address",
    );
  }

  const rpcUrl = readRpcUrl(problems);

  if (problems.length > 0 || !coreProgramId || !commerceProgramId) {
    cachedError = new PpvConfigError(
      `PPV devnet configuration is incomplete: ${problems.join("; ")}`,
      problems,
    );
    throw cachedError;
  }

  cached = { cluster: PPV_CLUSTER, coreProgramId, commerceProgramId, rpcUrl };
  return cached;
}

/** Non-throwing probe for render paths that must degrade to an explanation. */
export function readPpvConfig():
  | { ok: true; config: PpvConfig }
  | { ok: false; problems: readonly string[] } {
  try {
    return { ok: true, config: getPpvConfig() };
  } catch (error) {
    if (error instanceof PpvConfigError) {
      return { ok: false, problems: error.problems };
    }
    throw error;
  }
}

export function getPpvExplorerUrl(
  kind: "tx" | "address",
  value: string,
): string {
  const url = new URL(`https://explorer.solana.com/${kind}/${value}`);
  url.searchParams.set("cluster", PPV_CLUSTER);
  return url.toString();
}

/** Exposed for tests: clears the memoized resolution. */
export function resetPpvConfigCacheForTests() {
  cached = null;
  cachedError = null;
}
