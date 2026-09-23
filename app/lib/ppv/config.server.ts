import "server-only";

import { createHash } from "node:crypto";
import { PPV_DEPLOYMENT_MANIFEST } from "./deployment-manifest";
import { parsePpvConfig, PpvPolicyError } from "./policy";

export type PpvServerConfig = {
  policy: ReturnType<typeof parsePpvConfig>;
  rpcUrl: string | null;
  rpcProfileId: string;
  rpcEndpointSha256: string | null;
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

export function getPpvServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PpvServerConfig {
  const policy = parsePpvConfig(env);
  const rawRpc = env.PPV_SOLANA_RPC_URL?.trim() || "";
  const rpcProfileId = env.PPV_RPC_PROFILE_ID?.trim() || PPV_DEPLOYMENT_MANIFEST.rpcProfileId;

  if (!rawRpc) {
    if (policy.enabled) {
      throw new PpvPolicyError("PPV_RPC_REQUIRED");
    }
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
