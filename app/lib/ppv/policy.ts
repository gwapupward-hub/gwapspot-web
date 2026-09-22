export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";

export const PPV_PROGRAM_IDS = Object.freeze({
  core: "9cWE41ZDNQChvFrRoVuPQDeoVLg46ACTiZRCZaBZzfwU",
  commerce: "GmRDoFuPrBrsxnvTX751WK5rLu14JXe4sgjh6vNwHzr3",
  escrow: "7U1bCHQcr8Jg6J8G69JGaAWCRtsrZB1RYx4zo1sNEVF4",
});

export type PpvLayer = keyof typeof PPV_PROGRAM_IDS;
export type PpvCluster = "devnet" | "localnet";

export type PpvConfig = Readonly<{
  enabled: boolean;
  cluster: PpvCluster;
  core: boolean;
  commerce: boolean;
  escrow: boolean;
  mainnet: false;
  realValue: false;
  custodyGate: "CLOSED";
}>;

export type PpvProgramManifest = {
  programId: string;
  programDataAddress: string | null;
  deploymentSlot: number | null;
  upgradeAuthority: string | null;
  binarySha256: string | null;
  idlSha256: string | null;
  sourceCommit: string | null;
  sdkSourceCommit: string;
  mutationApproved: boolean;
  rr13_001FixedForBinary?: boolean;
};

export type PpvDeploymentManifest = {
  schemaVersion: 1;
  reviewStatus:
    | "INCOMPLETE_DO_NOT_ENABLE"
    | "APPROVED_DEVNET_INTEGRATION"
    | "APPROVED_LOCALNET_FIXTURE";
  cluster: PpvCluster;
  genesisHash: string;
  rpcProfileId: string;
  rpcEndpointSha256: string | null;
  sdkSourceCommit: string;
  securityTargetCommit: string;
  programs: Record<PpvLayer, PpvProgramManifest>;
};

export type PpvProgramObservation = {
  programId: string;
  exists: boolean;
  owner?: string;
  executable?: boolean;
  programDataAddress?: string;
  programDataOwner?: string;
  upgradeAuthority?: string | null;
  deploymentSlot?: number;
  binarySha256?: string;
  idlSha256?: string;
  sdkSourceCommit?: string;
  checkedAtMs?: number;
};

export type PpvEnvironmentObservation = {
  rpcProfileId: string;
  rpcEndpointSha256: string;
  genesisHash: string;
  programs: Record<PpvLayer, PpvProgramObservation>;
};

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export class PpvPolicyError extends Error {
  code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "PpvPolicyError";
    this.code = code;
  }
}

function requireCondition(ok: unknown, code: string): asserts ok {
  if (!ok) throw new PpvPolicyError(code);
}

function flag(env: Readonly<Record<string, string | undefined>>, key: string) {
  const value = env[key];
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new PpvPolicyError("INVALID_CONFIG", `${key} must be true or false`);
}

export function parsePpvConfig(env: Readonly<Record<string, string | undefined>>): PpvConfig {
  const cluster = env.PPV_CLUSTER ?? "devnet";
  const mainnet = flag(env, "PPV_MAINNET_ENABLED");
  const realValue = flag(env, "PPV_ESCROW_REAL_VALUE");
  const custodyGate = env.PPV_CUSTODY_GATE ?? "CLOSED";

  requireCondition(!mainnet && !realValue && custodyGate === "CLOSED", "MAINNET_DISABLED");
  requireCondition(cluster === "devnet" || cluster === "localnet", "UNSUPPORTED_CLUSTER");

  return Object.freeze({
    enabled: flag(env, "PPV_ENABLED"),
    cluster,
    core: flag(env, "PPV_CORE_ENABLED"),
    commerce: flag(env, "PPV_COMMERCE_ENABLED"),
    escrow: flag(env, "PPV_ESCROW_ENABLED"),
    mainnet: false,
    realValue: false,
    custodyGate: "CLOSED",
  });
}

export function assertEnvironment(
  config: PpvConfig,
  manifest: PpvDeploymentManifest,
  observation: Pick<PpvEnvironmentObservation, "rpcProfileId" | "rpcEndpointSha256" | "genesisHash">,
) {
  requireCondition(
    config.mainnet === false && config.realValue === false && config.custodyGate === "CLOSED",
    "MAINNET_DISABLED",
  );
  requireCondition(config.cluster === "devnet" || config.cluster === "localnet", "UNSUPPORTED_CLUSTER");
  requireCondition(manifest?.schemaVersion === 1, "MANIFEST_NOT_READY");

  const approval =
    config.cluster === "devnet" ? "APPROVED_DEVNET_INTEGRATION" : "APPROVED_LOCALNET_FIXTURE";
  requireCondition(
    manifest.reviewStatus === approval && manifest.cluster === config.cluster,
    "MANIFEST_NOT_READY",
  );
  requireCondition(
    observation.rpcProfileId.length > 0 && observation.rpcProfileId === manifest.rpcProfileId,
    "RPC_PROFILE_CHANGED",
  );
  requireCondition(
    SHA256.test(observation.rpcEndpointSha256) &&
      manifest.rpcEndpointSha256 === observation.rpcEndpointSha256,
    "RPC_PROFILE_CHANGED",
  );
  requireCondition(
    ADDRESS.test(manifest.genesisHash) && observation.genesisHash === manifest.genesisHash,
    "WRONG_GENESIS",
  );
  requireCondition(observation.genesisHash !== MAINNET_GENESIS, "MAINNET_DISABLED");

  if (config.cluster === "devnet") {
    requireCondition(manifest.genesisHash === DEVNET_GENESIS, "WRONG_GENESIS");
  } else {
    requireCondition(manifest.genesisHash !== DEVNET_GENESIS, "WRONG_GENESIS");
  }
}

export function assertProgramReady(
  config: PpvConfig,
  layer: PpvLayer,
  expected: PpvProgramManifest,
  observed: PpvProgramObservation,
  nowMs: number,
) {
  requireCondition(Object.hasOwn(PPV_PROGRAM_IDS, layer), "UNKNOWN_LAYER");
  requireCondition(config.enabled === true && config[layer] === true, "FEATURE_DISABLED");
  requireCondition(
    expected?.mutationApproved === true && expected.programId === PPV_PROGRAM_IDS[layer],
    "PROGRAM_NOT_APPROVED",
  );

  for (const field of ["binarySha256", "idlSha256"] as const) {
    requireCondition(SHA256.test(expected[field] ?? ""), "ARTIFACT_NOT_PINNED");
    requireCondition(observed?.[field] === expected[field], "ARTIFACT_MISMATCH");
  }

  requireCondition(
    COMMIT.test(expected.sourceCommit ?? "") && COMMIT.test(expected.sdkSourceCommit ?? ""),
    "ARTIFACT_NOT_PINNED",
  );
  requireCondition(observed?.sdkSourceCommit === expected.sdkSourceCommit, "SDK_MISMATCH");
  requireCondition(
    observed?.programId === expected.programId &&
      observed.exists === true &&
      observed.executable === true &&
      observed.owner === UPGRADEABLE_LOADER,
    "WRONG_PROGRAM",
  );
  requireCondition(
    ADDRESS.test(expected.programDataAddress ?? "") &&
      observed.programDataAddress === expected.programDataAddress &&
      observed.programDataOwner === UPGRADEABLE_LOADER,
    "PROGRAM_DATA_MISMATCH",
  );
  requireCondition(
    expected.upgradeAuthority === null || ADDRESS.test(expected.upgradeAuthority ?? ""),
    "AUTHORITY_NOT_PINNED",
  );
  requireCondition(
    Object.hasOwn(expected, "upgradeAuthority") &&
      observed.upgradeAuthority === expected.upgradeAuthority,
    "AUTHORITY_MISMATCH",
  );
  requireCondition(
    Number.isSafeInteger(expected.deploymentSlot) &&
      (expected.deploymentSlot ?? 0) > 0 &&
      observed.deploymentSlot === expected.deploymentSlot,
    "DEPLOYMENT_CHANGED",
  );
  requireCondition(
    Number.isSafeInteger(nowMs) &&
      Number.isSafeInteger(observed.checkedAtMs) &&
      (observed.checkedAtMs ?? nowMs + 1) <= nowMs &&
      nowMs - (observed.checkedAtMs ?? 0) <= 30_000,
    "STALE_READINESS",
  );
  if (layer === "escrow") {
    requireCondition(expected.rr13_001FixedForBinary === true, "RR13_BINARY_NOT_VERIFIED");
  }
}

export function assertMutationReady(input: {
  config: PpvConfig;
  manifest: PpvDeploymentManifest;
  observation: PpvEnvironmentObservation;
  layers: readonly PpvLayer[];
  nowMs: number;
}) {
  const { config, manifest, observation, layers, nowMs } = input;
  assertEnvironment(config, manifest, observation);
  requireCondition(Array.isArray(layers) && layers.length > 0, "NO_PROGRAM_DEPENDENCIES");
  for (const layer of new Set(layers)) {
    assertProgramReady(config, layer, manifest.programs[layer], observation.programs[layer], nowMs);
  }
}

export function assertTestAsset(
  asset: { mint?: string; tokenProgram?: string; decimals?: number },
  allowedAssets: readonly { mint: string; tokenProgram: string; decimals: number; testOnly: boolean }[],
  amountBaseUnits: unknown,
) {
  requireCondition(
    typeof amountBaseUnits === "string" && /^[1-9][0-9]*$/.test(amountBaseUnits),
    "INVALID_AMOUNT",
  );
  const amount = BigInt(amountBaseUnits);
  requireCondition(amount <= BigInt("18446744073709551615"), "INVALID_AMOUNT");
  const allowed = allowedAssets.find((candidate) => candidate.mint === asset?.mint);
  requireCondition(allowed?.testOnly === true && ADDRESS.test(allowed.mint), "ASSET_NOT_ALLOWED");
  requireCondition(
    asset.tokenProgram === TOKEN_PROGRAM && allowed.tokenProgram === TOKEN_PROGRAM,
    "TOKEN_PROGRAM_NOT_ALLOWED",
  );
  requireCondition(
    Number.isInteger(asset.decimals) &&
      (asset.decimals ?? -1) >= 0 &&
      (asset.decimals ?? 256) <= 255 &&
      asset.decimals === allowed.decimals,
    "DECIMALS_MISMATCH",
  );
  return amount;
}

export function assertSessionUnchanged(
  preview: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  requireCondition(current?.connected === true, "WALLET_DISCONNECTED");
  for (const key of ["wallet", "sessionEpoch", "genesisHash", "manifestDigest", "intentDigest"]) {
    requireCondition(
      typeof preview?.[key] === "string" &&
        (preview[key] as string).length > 0 &&
        current[key] === preview[key],
      "PREVIEW_STALE",
    );
  }
}

export function assertCitationPair(
  escrowProof: string | null | undefined,
  coreProof: string | null | undefined,
) {
  requireCondition(escrowProof === null || ADDRESS.test(escrowProof ?? ""), "INVALID_CITATION");
  requireCondition(coreProof === null || ADDRESS.test(coreProof ?? ""), "INVALID_CITATION");
  requireCondition((escrowProof === null) === (coreProof === null), "CITATION_PAIR_REQUIRED");
  if (escrowProof !== null) {
    requireCondition(escrowProof !== coreProof, "PROOF_IDENTITIES_COLLAPSED");
  }
}

export function requireFinalizedSuccessfulTransaction(input: {
  requestedCommitment: string;
  transaction: { slot?: number; meta?: { err?: unknown } | null } | null;
}) {
  requireCondition(input.requestedCommitment === "finalized", "NOT_FINALIZED");
  const transaction = input.transaction;
  requireCondition(
    transaction &&
      transaction.meta &&
      Object.hasOwn(transaction.meta, "err"),
    "EVIDENCE_INCOMPLETE",
  );
  requireCondition(transaction.meta.err === null, "TRANSACTION_FAILED");
  requireCondition(
    Number.isSafeInteger(transaction.slot) && (transaction.slot ?? -1) >= 0,
    "EVIDENCE_INCOMPLETE",
  );
  return transaction;
}
