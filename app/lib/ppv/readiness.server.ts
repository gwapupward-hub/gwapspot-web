import "server-only";

import { createHash } from "node:crypto";
import bs58 from "bs58";
import {
  PPV_DEPLOYMENT_MANIFEST,
  PPV_KNOWN_DEVNET_REFERENCE,
  PPV_SOURCE_PINS,
} from "./deployment-manifest";
import { getPpvObservationConfig, getPpvServerConfig, type PpvServerConfig } from "./config.server";
import {
  PPV_PROGRAM_IDS,
  UPGRADEABLE_LOADER,
  PpvPolicyError,
  assertMutationReady,
  type PpvEnvironmentObservation,
  type PpvLayer,
  type PpvProgramObservation,
} from "./policy";

const PROGRAMDATA_METADATA_BYTES = 45;
const READINESS_TTL_MS = 30_000;

type RpcAccount = {
  data: [string, "base64"] | string[];
  executable: boolean;
  owner: string;
};

type RpcAccountResult = {
  context: { slot: number };
  value: RpcAccount | null;
};

type RpcEnvelope<T> = {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: { code?: number; message?: string };
};

export type PpvCapabilityState = "disabled" | "unavailable" | "read_only" | "ready";

export type PpvCapability = {
  state: PpvCapabilityState;
  reasonCode: string | null;
};

export type PublicPpvReadiness = {
  schemaVersion: 1;
  checkedAt: string;
  cluster: "devnet" | "localnet";
  mainnet: false;
  realValue: false;
  enabled: boolean;
  manifest: {
    reviewStatus: string;
    sdkSourceCommit: string;
    securityTargetCommit: string;
  };
  layers: Record<PpvLayer, PpvCapability>;
  actions: Record<string, PpvCapability>;
  programs: Record<
    PpvLayer,
    {
      programId: string;
      exists: boolean | null;
      executable: boolean | null;
      deploymentSlot: number | null;
      status: string;
    }
  >;
  errorCode: string | null;
};

let cached:
  | {
      key: string;
      expiresAt: number;
      observation: PpvEnvironmentObservation;
    }
  | null = null;

async function rpc<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("PPV_RPC_UNAVAILABLE");
  const payload = (await response.json()) as RpcEnvelope<T>;
  if (payload.error || payload.result === undefined) throw new Error("PPV_RPC_UNAVAILABLE");
  return payload.result;
}

function accountBytes(account: RpcAccount) {
  const encoded = Array.isArray(account.data) ? account.data[0] : null;
  if (typeof encoded !== "string") throw new Error("PPV_RPC_MALFORMED_ACCOUNT");
  return Buffer.from(encoded, "base64");
}

function decodeUpgradeableProgramDataAddress(account: RpcAccount) {
  const bytes = accountBytes(account);
  if (bytes.length !== 36 || bytes.readUInt32LE(0) !== 2) {
    throw new Error("PPV_UNEXPECTED_PROGRAM_ACCOUNT");
  }
  return bs58.encode(bytes.subarray(4, 36));
}

function decodeProgramData(account: RpcAccount) {
  const bytes = accountBytes(account);
  if (bytes.length < PROGRAMDATA_METADATA_BYTES || bytes.readUInt32LE(0) !== 3) {
    throw new Error("PPV_UNEXPECTED_PROGRAMDATA_ACCOUNT");
  }

  const deploymentSlotBig = bytes.readBigUInt64LE(4);
  if (deploymentSlotBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("PPV_DEPLOYMENT_SLOT_OVERFLOW");
  }

  const authorityTag = bytes[12];
  const upgradeAuthority =
    authorityTag === 0
      ? null
      : authorityTag === 1
        ? bs58.encode(bytes.subarray(13, 45))
        : (() => {
            throw new Error("PPV_UNEXPECTED_PROGRAMDATA_ACCOUNT");
          })();

  return {
    deploymentSlot: Number(deploymentSlotBig),
    upgradeAuthority,
    binarySha256: createHash("sha256")
      .update(bytes.subarray(PROGRAMDATA_METADATA_BYTES))
      .digest("hex"),
  };
}

async function observeProgram(
  rpcUrl: string,
  layer: PpvLayer,
  checkedAtMs: number,
): Promise<PpvProgramObservation> {
  const programId = PPV_PROGRAM_IDS[layer];
  const program = await rpc<RpcAccountResult>(rpcUrl, "getAccountInfo", [
    programId,
    { encoding: "base64", commitment: "finalized" },
  ]);

  if (!program.value) return { programId, exists: false, checkedAtMs };

  const observation: PpvProgramObservation = {
    programId,
    exists: true,
    owner: program.value.owner,
    executable: program.value.executable,
    checkedAtMs,
    sdkSourceCommit: PPV_SOURCE_PINS.ppvPackage,
  };

  if (program.value.owner !== UPGRADEABLE_LOADER || !program.value.executable) {
    return observation;
  }

  const programDataAddress = decodeUpgradeableProgramDataAddress(program.value);
  const programData = await rpc<RpcAccountResult>(rpcUrl, "getAccountInfo", [
    programDataAddress,
    { encoding: "base64", commitment: "finalized" },
  ]);

  if (!programData.value) return { ...observation, programDataAddress };
  const decoded = decodeProgramData(programData.value);
  return {
    ...observation,
    programDataAddress,
    programDataOwner: programData.value.owner,
    upgradeAuthority: decoded.upgradeAuthority,
    deploymentSlot: decoded.deploymentSlot,
    binarySha256: decoded.binarySha256,
  };
}

async function observeEnvironment(
  config = getPpvObservationConfig(),
): Promise<PpvEnvironmentObservation> {
  if (!config.rpcUrl || !config.rpcEndpointSha256) throw new Error("PPV_RPC_REQUIRED");

  const cacheKey = [
    config.policy.cluster,
    config.rpcProfileId,
    config.rpcEndpointSha256,
    PPV_DEPLOYMENT_MANIFEST.sdkSourceCommit,
  ].join(":");
  const now = Date.now();
  if (cached && cached.key === cacheKey && cached.expiresAt > now) {
    return cached.observation;
  }

  const genesisHash = await rpc<string>(config.rpcUrl, "getGenesisHash");
  const checkedAtMs = Date.now();
  const [core, commerce, escrow] = await Promise.all([
    observeProgram(config.rpcUrl, "core", checkedAtMs),
    observeProgram(config.rpcUrl, "commerce", checkedAtMs),
    observeProgram(config.rpcUrl, "escrow", checkedAtMs),
  ]);

  const observation: PpvEnvironmentObservation = {
    rpcProfileId: config.rpcProfileId,
    rpcEndpointSha256: config.rpcEndpointSha256,
    genesisHash,
    programs: { core, commerce, escrow },
  };
  cached = { key: cacheKey, expiresAt: now + READINESS_TTL_MS, observation };
  return observation;
}

function layerCapability(
  layer: PpvLayer,
  enabled: boolean,
  observed: PpvProgramObservation | undefined,
): PpvCapability {
  if (!enabled) return { state: "disabled", reasonCode: "FEATURE_DISABLED" };
  if (!observed?.exists) return { state: "unavailable", reasonCode: "PROGRAM_NOT_DEPLOYED" };
  if (observed.owner !== UPGRADEABLE_LOADER || observed.executable !== true) {
    return { state: "unavailable", reasonCode: "WRONG_PROGRAM" };
  }
  return { state: "read_only", reasonCode: "ARTIFACT_COMPATIBILITY_NOT_APPROVED" };
}

function actionCapability(
  enabled: boolean,
  blocker: string,
): PpvCapability {
  return enabled
    ? { state: "unavailable", reasonCode: blocker }
    : { state: "disabled", reasonCode: "FEATURE_DISABLED" };
}

function programStatus(layer: PpvLayer, observed: PpvProgramObservation | undefined) {
  if (!observed) return "not_checked";
  if (!observed.exists) return "not_deployed";
  if (observed.owner !== UPGRADEABLE_LOADER || observed.executable !== true) return "unexpected_program";
  if (
    layer === "escrow" &&
    observed.deploymentSlot === PPV_KNOWN_DEVNET_REFERENCE.escrowPreRr13.deploymentSlot &&
    observed.binarySha256 === PPV_KNOWN_DEVNET_REFERENCE.escrowPreRr13.binarySha256
  ) {
    return "pre_rr13_001_binary";
  }
  return "observed_unattested";
}

export async function getPpvWorkspaceReadiness(): Promise<PublicPpvReadiness> {
  const checkedAt = new Date().toISOString();

  try {
    const server = getPpvServerConfig();
    const base: Omit<PublicPpvReadiness, "layers" | "actions" | "programs" | "errorCode"> = {
      schemaVersion: 1,
      checkedAt,
      cluster: server.policy.cluster,
      mainnet: false,
      realValue: false,
      enabled: server.policy.enabled,
      manifest: {
        reviewStatus: PPV_DEPLOYMENT_MANIFEST.reviewStatus,
        sdkSourceCommit: PPV_DEPLOYMENT_MANIFEST.sdkSourceCommit,
        securityTargetCommit: PPV_DEPLOYMENT_MANIFEST.securityTargetCommit,
      },
    };

    if (!server.policy.enabled) {
      const disabled: PpvCapability = { state: "disabled", reasonCode: "FEATURE_DISABLED" };
      return {
        ...base,
        layers: { core: disabled, commerce: disabled, escrow: disabled },
        actions: {
          "proof.create": disabled,
          "proof.revoke": disabled,
          "agreement.create": disabled,
          "agreement.sign": disabled,
          "escrow.open": disabled,
          "escrow.fund": disabled,
          "escrow.settle": disabled,
        },
        programs: {
          core: { programId: PPV_PROGRAM_IDS.core, exists: null, executable: null, deploymentSlot: null, status: "not_checked" },
          commerce: { programId: PPV_PROGRAM_IDS.commerce, exists: null, executable: null, deploymentSlot: null, status: "not_checked" },
          escrow: { programId: PPV_PROGRAM_IDS.escrow, exists: null, executable: null, deploymentSlot: null, status: "not_checked" },
        },
        errorCode: null,
      };
    }

    const observation = await observeEnvironment();
    const escrowStatus = programStatus("escrow", observation.programs.escrow);
    const layers = {
      core: layerCapability("core", server.policy.core, observation.programs.core),
      commerce: layerCapability("commerce", server.policy.commerce, observation.programs.commerce),
      escrow: layerCapability("escrow", server.policy.escrow, observation.programs.escrow),
    };
    const coreBlocker = observation.programs.core.exists
      ? "ARTIFACT_COMPATIBILITY_NOT_APPROVED"
      : "PROGRAM_NOT_DEPLOYED";
    const commerceBlocker = observation.programs.commerce.exists
      ? "ARTIFACT_COMPATIBILITY_NOT_APPROVED"
      : "PROGRAM_NOT_DEPLOYED";
    const escrowBlocker =
      escrowStatus === "pre_rr13_001_binary"
        ? "RR13_BINARY_NOT_VERIFIED"
        : observation.programs.escrow.exists
          ? "ARTIFACT_COMPATIBILITY_NOT_APPROVED"
          : "PROGRAM_NOT_DEPLOYED";

    return {
      ...base,
      layers,
      actions: {
        "proof.create": actionCapability(server.policy.core, coreBlocker),
        "proof.revoke": actionCapability(server.policy.core, coreBlocker),
        "agreement.create": actionCapability(server.policy.commerce, commerceBlocker),
        "agreement.sign": actionCapability(server.policy.commerce, commerceBlocker),
        "escrow.open": actionCapability(server.policy.escrow, escrowBlocker),
        "escrow.fund": actionCapability(server.policy.escrow, escrowBlocker),
        "escrow.settle": actionCapability(server.policy.escrow, escrowBlocker),
      },
      programs: {
        core: {
          programId: PPV_PROGRAM_IDS.core,
          exists: observation.programs.core.exists,
          executable: observation.programs.core.executable ?? null,
          deploymentSlot: observation.programs.core.deploymentSlot ?? null,
          status: programStatus("core", observation.programs.core),
        },
        commerce: {
          programId: PPV_PROGRAM_IDS.commerce,
          exists: observation.programs.commerce.exists,
          executable: observation.programs.commerce.executable ?? null,
          deploymentSlot: observation.programs.commerce.deploymentSlot ?? null,
          status: programStatus("commerce", observation.programs.commerce),
        },
        escrow: {
          programId: PPV_PROGRAM_IDS.escrow,
          exists: observation.programs.escrow.exists,
          executable: observation.programs.escrow.executable ?? null,
          deploymentSlot: observation.programs.escrow.deploymentSlot ?? null,
          status: escrowStatus,
        },
      },
      errorCode: null,
    };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? error.code
          : "PPV_READINESS_UNAVAILABLE";
    const unavailable: PpvCapability = { state: "unavailable", reasonCode: code };
    return {
      schemaVersion: 1,
      checkedAt,
      cluster: "devnet",
      mainnet: false,
      realValue: false,
      enabled: false,
      manifest: {
        reviewStatus: PPV_DEPLOYMENT_MANIFEST.reviewStatus,
        sdkSourceCommit: PPV_DEPLOYMENT_MANIFEST.sdkSourceCommit,
        securityTargetCommit: PPV_DEPLOYMENT_MANIFEST.securityTargetCommit,
      },
      layers: { core: unavailable, commerce: unavailable, escrow: unavailable },
      actions: {
        "proof.create": unavailable,
        "proof.revoke": unavailable,
        "agreement.create": unavailable,
        "agreement.sign": unavailable,
        "escrow.open": unavailable,
        "escrow.fund": unavailable,
        "escrow.settle": unavailable,
      },
      programs: {
        core: { programId: PPV_PROGRAM_IDS.core, exists: null, executable: null, deploymentSlot: null, status: "not_checked" },
        commerce: { programId: PPV_PROGRAM_IDS.commerce, exists: null, executable: null, deploymentSlot: null, status: "not_checked" },
        escrow: { programId: PPV_PROGRAM_IDS.escrow, exists: null, executable: null, deploymentSlot: null, status: "not_checked" },
      },
      errorCode: code,
    };
  }
}
