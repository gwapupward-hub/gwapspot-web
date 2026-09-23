import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVNET_GENESIS,
  MAINNET_GENESIS,
  PPV_PROGRAM_IDS,
  TOKEN_PROGRAM,
  UPGRADEABLE_LOADER,
  PpvPolicyError,
  assertCitationPair,
  assertEnvironment,
  assertMutationReady,
  assertProgramReady,
  assertSessionUnchanged,
  assertTestAsset,
  parsePpvConfig,
  requireFinalizedSuccessfulTransaction,
} from "./policy.ts";

const A = "11111111111111111111111111111111";
const B = "SysvarRent111111111111111111111111111111111";
const NOW = 2_000_000;
const HASH = "a".repeat(64);
const IDL = "b".repeat(64);
const COMMIT = "c".repeat(40);

function fail(code) {
  return (error) => error instanceof PpvPolicyError && error.code === code;
}

function config(extra = {}) {
  return parsePpvConfig({
    PPV_ENABLED: "true",
    PPV_CLUSTER: "devnet",
    PPV_CORE_ENABLED: "true",
    PPV_COMMERCE_ENABLED: "true",
    PPV_ESCROW_ENABLED: "true",
    PPV_MAINNET_ENABLED: "false",
    PPV_ESCROW_REAL_VALUE: "false",
    PPV_CUSTODY_GATE: "CLOSED",
    ...extra,
  });
}

function program(layer) {
  return {
    programId: PPV_PROGRAM_IDS[layer],
    programDataAddress: A,
    deploymentSlot: 100,
    upgradeAuthority: B,
    binarySha256: HASH,
    idlSha256: IDL,
    sourceCommit: COMMIT,
    sdkSourceCommit: COMMIT,
    mutationApproved: true,
    ...(layer === "escrow" ? { rr13_001FixedForBinary: true } : {}),
  };
}

function manifest(extra = {}) {
  return {
    schemaVersion: 1,
    reviewStatus: "APPROVED_DEVNET_INTEGRATION",
    cluster: "devnet",
    genesisHash: DEVNET_GENESIS,
    rpcProfileId: "ppv-devnet-primary",
    rpcEndpointSha256: HASH,
    sdkSourceCommit: COMMIT,
    securityTargetCommit: COMMIT,
    programs: {
      core: program("core"),
      commerce: program("commerce"),
      escrow: program("escrow"),
    },
    ...extra,
  };
}

function observedProgram(layer) {
  return {
    programId: PPV_PROGRAM_IDS[layer],
    exists: true,
    owner: UPGRADEABLE_LOADER,
    executable: true,
    programDataAddress: A,
    programDataOwner: UPGRADEABLE_LOADER,
    upgradeAuthority: B,
    deploymentSlot: 100,
    binarySha256: HASH,
    idlSha256: IDL,
    sdkSourceCommit: COMMIT,
    checkedAtMs: NOW,
  };
}

function observation(extra = {}) {
  return {
    rpcProfileId: "ppv-devnet-primary",
    rpcEndpointSha256: HASH,
    genesisHash: DEVNET_GENESIS,
    programs: {
      core: observedProgram("core"),
      commerce: observedProgram("commerce"),
      escrow: observedProgram("escrow"),
    },
    ...extra,
  };
}

test("missing enable flags are disabled", () => {
  const parsed = parsePpvConfig({});
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.core, false);
  assert.equal(parsed.commerce, false);
  assert.equal(parsed.escrow, false);
});

test("literal false is false", () => {
  assert.equal(parsePpvConfig({ PPV_ENABLED: "false" }).enabled, false);
});

test("malformed boolean fails closed", () => {
  assert.throws(() => parsePpvConfig({ PPV_ENABLED: "False" }), fail("INVALID_CONFIG"));
});

test("mainnet flag is rejected", () => {
  assert.throws(() => config({ PPV_MAINNET_ENABLED: "true" }), fail("MAINNET_DISABLED"));
});

test("real-value flag is rejected", () => {
  assert.throws(() => config({ PPV_ESCROW_REAL_VALUE: "true" }), fail("MAINNET_DISABLED"));
});

test("open custody gate is rejected", () => {
  assert.throws(() => config({ PPV_CUSTODY_GATE: "OPEN" }), fail("MAINNET_DISABLED"));
});

test("unknown cluster is rejected", () => {
  assert.throws(() => config({ PPV_CLUSTER: "mainnet-beta" }), fail("UNSUPPORTED_CLUSTER"));
});

test("approved devnet environment passes", () => {
  assert.doesNotThrow(() => assertEnvironment(config(), manifest(), observation()));
});

test("incomplete manifest rejects writes", () => {
  assert.throws(
    () => assertEnvironment(config(), manifest({ reviewStatus: "INCOMPLETE_DO_NOT_ENABLE" }), observation()),
    fail("MANIFEST_NOT_READY"),
  );
});

test("wrong genesis rejects writes", () => {
  assert.throws(
    () => assertEnvironment(config(), manifest(), observation({ genesisHash: MAINNET_GENESIS })),
    fail("WRONG_GENESIS"),
  );
});

test("rpc profile change rejects writes", () => {
  assert.throws(
    () => assertEnvironment(config(), manifest(), observation({ rpcProfileId: "other" })),
    fail("RPC_PROFILE_CHANGED"),
  );
});

test("endpoint fingerprint change rejects writes", () => {
  assert.throws(
    () => assertEnvironment(config(), manifest(), observation({ rpcEndpointSha256: "d".repeat(64) })),
    fail("RPC_PROFILE_CHANGED"),
  );
});

test("disabled layer cannot mutate", () => {
  const c = config({ PPV_CORE_ENABLED: "false" });
  assert.throws(
    () => assertProgramReady(c, "core", manifest().programs.core, observation().programs.core, NOW),
    fail("FEATURE_DISABLED"),
  );
});

test("unapproved program cannot mutate", () => {
  const expected = { ...manifest().programs.core, mutationApproved: false };
  assert.throws(
    () => assertProgramReady(config(), "core", expected, observation().programs.core, NOW),
    fail("PROGRAM_NOT_APPROVED"),
  );
});

test("binary hash must be pinned", () => {
  const expected = { ...manifest().programs.core, binarySha256: null };
  assert.throws(
    () => assertProgramReady(config(), "core", expected, observation().programs.core, NOW),
    fail("ARTIFACT_NOT_PINNED"),
  );
});

test("idl mismatch rejects writes", () => {
  const observed = { ...observation().programs.core, idlSha256: "d".repeat(64) };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("ARTIFACT_MISMATCH"),
  );
});

test("sdk mismatch rejects writes", () => {
  const observed = { ...observation().programs.core, sdkSourceCommit: "d".repeat(40) };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("SDK_MISMATCH"),
  );
});

test("wrong program id rejects writes", () => {
  const observed = { ...observation().programs.core, programId: A };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("WRONG_PROGRAM"),
  );
});

test("non executable program rejects writes", () => {
  const observed = { ...observation().programs.core, executable: false };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("WRONG_PROGRAM"),
  );
});

test("program data substitution rejects writes", () => {
  const observed = { ...observation().programs.core, programDataAddress: B };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("PROGRAM_DATA_MISMATCH"),
  );
});

test("authority change rejects writes", () => {
  const observed = { ...observation().programs.core, upgradeAuthority: A };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("AUTHORITY_MISMATCH"),
  );
});

test("deployment slot change rejects writes", () => {
  const observed = { ...observation().programs.core, deploymentSlot: 101 };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("DEPLOYMENT_CHANGED"),
  );
});

test("stale readiness rejects writes", () => {
  const observed = { ...observation().programs.core, checkedAtMs: NOW - 30_001 };
  assert.throws(
    () => assertProgramReady(config(), "core", manifest().programs.core, observed, NOW),
    fail("STALE_READINESS"),
  );
});

test("escrow lacking RR13-001 pin rejects writes", () => {
  const expected = { ...manifest().programs.escrow, rr13_001FixedForBinary: false };
  assert.throws(
    () => assertProgramReady(config(), "escrow", expected, observation().programs.escrow, NOW),
    fail("RR13_BINARY_NOT_VERIFIED"),
  );
});

test("multi-program mutation checks every dependency", () => {
  const o = observation();
  o.programs.commerce.exists = false;
  assert.throws(
    () => assertMutationReady({ config: config(), manifest: manifest(), observation: o, layers: ["core", "commerce"], nowMs: NOW }),
    fail("WRONG_PROGRAM"),
  );
});

test("test amounts use exact u64 base units", () => {
  const asset = { mint: A, tokenProgram: TOKEN_PROGRAM, decimals: 6 };
  const allowed = [{ ...asset, testOnly: true }];
  assert.equal(assertTestAsset(asset, allowed, "18446744073709551615"), 18446744073709551615n);
  for (const amount of ["0", "01", "1.2", "1e6", "-1", "18446744073709551616", 1]) {
    assert.throws(() => assertTestAsset(asset, allowed, amount), fail("INVALID_AMOUNT"));
  }
});

test("unknown mint is rejected", () => {
  const asset = { mint: A, tokenProgram: TOKEN_PROGRAM, decimals: 6 };
  assert.throws(
    () => assertTestAsset({ ...asset, mint: B }, [{ ...asset, testOnly: true }], "1"),
    fail("ASSET_NOT_ALLOWED"),
  );
});

test("session changes invalidate preview", () => {
  const preview = {
    wallet: A,
    sessionEpoch: "one",
    genesisHash: DEVNET_GENESIS,
    manifestDigest: "abc",
    intentDigest: "def",
  };
  assert.doesNotThrow(() => assertSessionUnchanged(preview, { ...preview, connected: true }));
  for (const key of Object.keys(preview)) {
    assert.throws(
      () => assertSessionUnchanged(preview, { ...preview, connected: true, [key]: "changed" }),
      fail("PREVIEW_STALE"),
    );
  }
});

test("citation requires both distinct proof identities or neither", () => {
  assert.doesNotThrow(() => assertCitationPair(null, null));
  assert.doesNotThrow(() => assertCitationPair(A, B));
  assert.throws(() => assertCitationPair(A, null), fail("CITATION_PAIR_REQUIRED"));
  assert.throws(() => assertCitationPair(null, B), fail("CITATION_PAIR_REQUIRED"));
  assert.throws(() => assertCitationPair(A, A), fail("PROOF_IDENTITIES_COLLAPSED"));
  assert.throws(() => assertCitationPair(undefined, undefined), fail("INVALID_CITATION"));
});

test("only finalized successful transaction evidence passes prerequisite", () => {
  assert.throws(
    () => requireFinalizedSuccessfulTransaction({ requestedCommitment: "confirmed", transaction: { slot: 1, meta: { err: null } } }),
    fail("NOT_FINALIZED"),
  );
  assert.throws(
    () => requireFinalizedSuccessfulTransaction({ requestedCommitment: "finalized", transaction: { slot: 1, meta: {} } }),
    fail("EVIDENCE_INCOMPLETE"),
  );
  assert.throws(
    () => requireFinalizedSuccessfulTransaction({ requestedCommitment: "finalized", transaction: { slot: 1, meta: { err: { InstructionError: [0, "Custom"] } } } }),
    fail("TRANSACTION_FAILED"),
  );
  assert.equal(
    requireFinalizedSuccessfulTransaction({ requestedCommitment: "finalized", transaction: { slot: 7, meta: { err: null } } }).slot,
    7,
  );
});
