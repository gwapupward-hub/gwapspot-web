import {
  DEVNET_GENESIS,
  PPV_PROGRAM_IDS,
  type PpvDeploymentManifest,
} from "./policy";

export const PPV_SOURCE_PINS = Object.freeze({
  appBaseline: "c25f61c76d18cbd057e6ca68bd42291cc3ae5de7",
  ppvPackage: "7c4ea67a9b6d69ab85a20f497eb0c2a31b48cfd2",
  securityTarget: "e574c69570979081e34e0358673c62f87ba9220d",
});

/**
 * Devnet integration manifest.
 *
 * PPV Core is independently evidenced at its permanent devnet identity and is
 * approved for non-custodial proof mutations when the explicit server feature
 * flags and pinned RPC profile are enabled. Commerce remains undeployed at its
 * canonical identity. Escrow remains mutation-blocked and custody-closed.
 */
export const PPV_DEPLOYMENT_MANIFEST: PpvDeploymentManifest = Object.freeze({
  schemaVersion: 1,
  reviewStatus: "APPROVED_DEVNET_INTEGRATION",
  cluster: "devnet",
  genesisHash: DEVNET_GENESIS,
  rpcProfileId: "ppv-devnet-primary",
  rpcEndpointSha256: "bc95b598fcf3836ad74ab0151571f8305e869eea1112ab41a89d6e66116bacfe",
  sdkSourceCommit: PPV_SOURCE_PINS.ppvPackage,
  securityTargetCommit: PPV_SOURCE_PINS.securityTarget,
  programs: {
    core: {
      programId: PPV_PROGRAM_IDS.core,
      programDataAddress: "FfEQrpiQSzxUErCBkXCukbt26JivKiExA6HswMpQkiSA",
      deploymentSlot: 497437304,
      upgradeAuthority: "B6tcsTrMCKTZV5vi3rRCnA3FMPeeWACSHuuTSz5XQgnX",
      binarySha256: "91f95db407c3573eb1693bb52f86fc367113ea537b7628fc6ccc332cb727261e",
      idlSha256: "e645f974739868f8c793b29ab1be9bd654bfe4fc1d95b0e35895cd51018c093f",
      sourceCommit: "861a8dfce9533f75494621b8a36e60e60447cc0c",
      sdkSourceCommit: PPV_SOURCE_PINS.ppvPackage,
      mutationApproved: true,
    },
    commerce: {
      programId: PPV_PROGRAM_IDS.commerce,
      programDataAddress: null,
      deploymentSlot: null,
      upgradeAuthority: null,
      binarySha256: null,
      idlSha256: null,
      sourceCommit: null,
      sdkSourceCommit: PPV_SOURCE_PINS.ppvPackage,
      mutationApproved: false,
    },
    escrow: {
      programId: PPV_PROGRAM_IDS.escrow,
      programDataAddress: null,
      deploymentSlot: null,
      upgradeAuthority: null,
      binarySha256: null,
      idlSha256: null,
      sourceCommit: null,
      sdkSourceCommit: PPV_SOURCE_PINS.ppvPackage,
      mutationApproved: false,
      rr13_001FixedForBinary: false,
    },
  },
});

export const PPV_KNOWN_DEVNET_REFERENCE = Object.freeze({
  observedAt: "2026-09-22T00:45:00.131Z",
  core: {
    deploymentSlot: 497437304,
    binarySha256: "91f95db407c3573eb1693bb52f86fc367113ea537b7628fc6ccc332cb727261e",
  },
  commerce: { exists: false },
  escrowPreRr13: {
    deploymentSlot: 498656161,
    binarySha256: "0acc61defeb2ee810cf3a4bc87f93f8ef457399fe6b52d170055ed7e0c96f9bf",
  },
});
