import "server-only";

import { createHash } from "node:crypto";
import { PPV_DEPLOYMENT_MANIFEST } from "./deployment-manifest";
import { parsePpvConfig, PpvPolicyError } from "./policy";

const DEFAULT_DEVNET_OBSERVATION_RPC = "https://api.devnet.solana.com";

export type PpvServerConfig = {
  policy: ReturnType<typeof parsePpvConfig>;
  rpcUrl: string | null;
  rpcProfileId: string;
  rpcEndpointSha256: string | null;
};

export type PpvObservationConfig = PpvServerConfig & {
  source: "server" | "public";
};

function endpointSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseRpc(value: string, cluster: "devnet" | "localnet") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PpvPolicyError("INVALID_RPC_URL");
  }
  if (url.username || url.password) throw new PpvPolicyError("INVALID_RPC_URL");
  if (cluster === "devnet" && url.protocol !== "https:") {
    throw new PpvPolicyError("INVALID_RPC_URL");
  }
  if (
    cluster === "localnet" &&
    (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol))
  ) {
    throw new PpvPolicyError("LOCALNET_RPC_REQUIRED");
  }
  return url.toString();
}

function resolvedConfig(
  policy: ReturnType<typeof parsePpvConfig>,
  rawRpc: string,
  rpcProfileId: string,
): PpvServerConfig {
  if (!rawRpc) {
    return { policy, rpcUrl: null, rpcProfileId, rpcEndpointSha256: null };
  }
  const rpcUrl = parseRpc(rawRpc, policy.cluster);
  return {
    policy,
    rpcUrl,
    rpcProfileId,
    rpcEndpointSha256: endpointSha256(rpcUrl),
  };
}

export function getPpvServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PpvServerConfig {
  const policy = parsePpvConfig(env);
  const rawRpc = env.PPV_SOLANA_RPC_URL?.trim() || "";
  const rpcProfileId = env.PPV_RPC_PROFILE_ID?.trim() || PPV_DEPLOYMENT_MANIFEST.rpcProfileId;

  if (!rawRpc && policy.enabled) {
    throw new PpvPolicyError("PPV_RPC_REQUIRED");
  }
  return resolvedConfig(policy, rawRpc, rpcProfileId);
}

/**
 * Read-only observation may use the browser-visible devnet endpoint when the
 * dedicated server endpoint is not configured. Mutation preparation never uses
 * this fallback; getPpvServerConfig remains server-RPC-only and fail-closed.
 */
export function getPpvObservationConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PpvObservationConfig {
  const policy = parsePpvConfig(env);
  const serverRpc = env.PPV_SOLANA_RPC_URL?.trim() || "";
  const publicRpc =
    env.NEXT_PUBLIC_PPV_RPC_URL?.trim() ||
    (policy.cluster === "devnet" ? DEFAULT_DEVNET_OBSERVATION_RPC : "");
  const rpcProfileId = env.PPV_RPC_PROFILE_ID?.trim() || PPV_DEPLOYMENT_MANIFEST.rpcProfileId;
  const source = serverRpc ? "server" : "public";
  const config = resolvedConfig(policy, serverRpc || publicRpc, rpcProfileId);
  return { ...config, source };
}
