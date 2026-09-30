import {
  GWAP_APP_HOSTNAME,
  GWAP_DEVNET_HOSTNAME,
  normalizeHostname,
} from "./app-domain-routing";

export type GwapOsRuntimeMode = "production" | "devnet";

export type GwapOsRuntime = Readonly<{
  mode: GwapOsRuntimeMode;
  hostname: string;
  solanaCluster: "mainnet-beta" | "devnet";
  realValueWritesEnabled: boolean;
}>;

function normalizedOverride(value: string | undefined) {
  return value?.trim().toLowerCase() === "devnet" ? "devnet" : "production";
}

export function resolveGwapOsRuntime(input: {
  host: string | null | undefined;
  override?: string;
}): GwapOsRuntime {
  const hostname = normalizeHostname(input.host);

  if (hostname === GWAP_DEVNET_HOSTNAME) {
    return {
      mode: "devnet",
      hostname,
      solanaCluster: "devnet",
      realValueWritesEnabled: false,
    };
  }

  if (hostname === GWAP_APP_HOSTNAME) {
    return {
      mode: "production",
      hostname,
      solanaCluster: "mainnet-beta",
      realValueWritesEnabled: true,
    };
  }

  const mode = normalizedOverride(input.override);
  return {
    mode,
    hostname,
    solanaCluster: mode === "devnet" ? "devnet" : "mainnet-beta",
    realValueWritesEnabled: mode !== "devnet",
  };
}
