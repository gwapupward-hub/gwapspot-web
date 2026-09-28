export const PPV_RUNTIME_ENVIRONMENT_SCHEMA_VERSION = 1 as const;

export type PpvRuntimeCluster = "devnet" | "localnet";
export type PpvLayerName = "core" | "commerce" | "escrow";

export type PpvRuntimeEnvironmentV1 = Readonly<{
  schemaVersion: typeof PPV_RUNTIME_ENVIRONMENT_SCHEMA_VERSION;
  cluster: PpvRuntimeCluster;
  genesisHash: string;
  rpcProfileId: string;
  programs: Readonly<Record<PpvLayerName, string>>;
}>;

export type PreparedPpvTransactionEnvironment = Readonly<{
  cluster: string;
  chain: string;
  genesisHash: string;
  rpcProfileId: string;
  programId: string;
}>;

export type WalletChainSupport = "supported" | "unsupported" | "unknown";

export type PpvEnvironmentErrorCode =
  | "PPV_ENVIRONMENT_UNVERIFIED"
  | "PPV_WALLET_CLUSTER_UNSUPPORTED"
  | "PPV_PREPARED_CLUSTER_MISMATCH"
  | "PPV_PREPARED_CHAIN_MISMATCH"
  | "PPV_PREPARED_GENESIS_MISMATCH"
  | "PPV_PREPARED_RPC_PROFILE_MISMATCH"
  | "PPV_PREPARED_PROGRAM_MISMATCH";

export class PpvEnvironmentError extends Error {
  readonly code: PpvEnvironmentErrorCode;

  constructor(code: PpvEnvironmentErrorCode) {
    super(code);
    this.name = "PpvEnvironmentError";
    this.code = code;
  }
}

export function walletChainForPpvCluster(
  cluster: PpvRuntimeCluster,
): "solana:devnet" | null {
  return cluster === "devnet" ? "solana:devnet" : null;
}

export function assertPreparedPpvEnvironment(input: {
  expected: PpvRuntimeEnvironmentV1 | null;
  prepared: PreparedPpvTransactionEnvironment;
  layer: PpvLayerName;
}) {
  const { expected, prepared, layer } = input;
  if (
    !expected ||
    expected.schemaVersion !== PPV_RUNTIME_ENVIRONMENT_SCHEMA_VERSION ||
    !expected.genesisHash ||
    !expected.rpcProfileId
  ) {
    throw new PpvEnvironmentError("PPV_ENVIRONMENT_UNVERIFIED");
  }

  const expectedChain = walletChainForPpvCluster(expected.cluster);
  if (!expectedChain) {
    throw new PpvEnvironmentError("PPV_WALLET_CLUSTER_UNSUPPORTED");
  }
  if (prepared.cluster !== expected.cluster) {
    throw new PpvEnvironmentError("PPV_PREPARED_CLUSTER_MISMATCH");
  }
  if (prepared.chain !== expectedChain) {
    throw new PpvEnvironmentError("PPV_PREPARED_CHAIN_MISMATCH");
  }
  if (prepared.genesisHash !== expected.genesisHash) {
    throw new PpvEnvironmentError("PPV_PREPARED_GENESIS_MISMATCH");
  }
  if (prepared.rpcProfileId !== expected.rpcProfileId) {
    throw new PpvEnvironmentError("PPV_PREPARED_RPC_PROFILE_MISMATCH");
  }
  if (prepared.programId !== expected.programs[layer]) {
    throw new PpvEnvironmentError("PPV_PREPARED_PROGRAM_MISMATCH");
  }

  return {
    cluster: expected.cluster,
    chain: expectedChain,
    genesisHash: expected.genesisHash,
    rpcProfileId: expected.rpcProfileId,
    programId: expected.programs[layer],
  } as const;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function accountChains(value: unknown): readonly string[] | null {
  const candidate = record(value);
  if (!candidate || !Array.isArray(candidate.chains)) return null;
  return candidate.chains.every((chain) => typeof chain === "string")
    ? (candidate.chains as string[])
    : null;
}

/**
 * Wallet Standard exposes chains an account supports, but external wallets do
 * not consistently expose the user's currently selected network. This helper
 * therefore reports only capability. "supported" must never be interpreted as
 * proof that Phantom/Testnet Mode is currently set to Devnet.
 */
export function inspectWalletChainSupport(
  wallet: unknown,
  expectedChain: string,
): WalletChainSupport {
  const candidate = record(wallet);
  if (!candidate) return "unknown";

  const directAccounts = Array.isArray(candidate.accounts)
    ? candidate.accounts
    : null;
  const standardWallet = record(candidate.standardWallet);
  const standardAccounts =
    standardWallet && Array.isArray(standardWallet.accounts)
      ? standardWallet.accounts
      : null;
  const accounts = directAccounts ?? standardAccounts;
  if (!accounts || accounts.length === 0) return "unknown";

  const advertised = accounts
    .map(accountChains)
    .filter((chains): chains is readonly string[] => chains !== null);

  if (advertised.length === 0) return "unknown";
  return advertised.some((chains) => chains.includes(expectedChain))
    ? "supported"
    : "unsupported";
}

export function ppvExplorerTransactionUrl(
  signature: string,
  cluster: PpvRuntimeCluster,
) {
  const encoded = encodeURIComponent(signature);
  return cluster === "devnet"
    ? `https://explorer.solana.com/tx/${encoded}?cluster=devnet`
    : `https://explorer.solana.com/tx/${encoded}?cluster=custom`;
}

export const PPV_ENVIRONMENT_RESPONSE_HEADERS = Object.freeze({
  schema: "X-PPV-Environment-Schema",
  cluster: "X-PPV-Cluster",
  genesisHash: "X-PPV-Genesis-Hash",
  rpcProfileId: "X-PPV-RPC-Profile",
});

export function ppvEnvironmentResponseHeaders(
  environment: PpvRuntimeEnvironmentV1,
): Record<string, string> {
  return {
    [PPV_ENVIRONMENT_RESPONSE_HEADERS.schema]: String(
      environment.schemaVersion,
    ),
    [PPV_ENVIRONMENT_RESPONSE_HEADERS.cluster]: environment.cluster,
    [PPV_ENVIRONMENT_RESPONSE_HEADERS.genesisHash]: environment.genesisHash,
    [PPV_ENVIRONMENT_RESPONSE_HEADERS.rpcProfileId]: environment.rpcProfileId,
  };
}
