import {
  DEVNET_GENESIS,
  PPV_PROGRAM_IDS,
  type PpvDeploymentManifest,
} from "./policy";

export const PPV_SOURCE_PINS = Object.freeze({
  appBaseline: "9d16924e5f637907d41efe4f141d32fef37c9666",
  ppvPackage: "7c4ea67a9b6d69ab85a20f497eb0c2a31b48cfd2",
  securityTarget: "e574c69570979081e34e0358673c62f87ba9220d",
});

/**
 * This manifest intentionally cannot authorize mutations.
 *
 * Public devnet currently has no Commerce account at the canonical ID, and the
 * observed Escrow binary is the pre-RR13-001 release. A reviewed deployment
 * update must replace the null artifact pins and set mutationApproved only after
 * binary/IDL/SDK/source correspondence is independently evidenced.
 */
export const PPV_DEPLOYMENT_MANIFEST: PpvDeploymentManifest = Object.freeze({
  schemaVersion: 1,
  reviewStatus: "INCOMPLETE_DO_NOT_ENABLE",
  cluster: "devnet",
  genesisHash: DEVNET_GENESIS,
  rpcProfileId: "ppv-devnet-primary",
  rpcEndpointSha256: null,
  sdkSourceCommit: PPV_SOURCE_PINS.ppvPackage,
  securityTargetCommit: PPV_SOURCE_PINS.securityTarget,
  programs: {
    core: {
      programId: PPV_PROGRAM_IDS.core,
      programDataAddress: null,
      deploymentSlot: null,
      upgradeAuthority: null,
      binarySha256: null,
      idlSha256: null,
      sourceCommit: null,
      sdkSourceCommit: PPV_SOURCE_PINS.ppvPackage,
      mutationApproved: false,
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
