import assert from "node:assert/strict";
import test from "node:test";
import {
  PpvEnvironmentError,
  assertPreparedPpvEnvironment,
  inspectWalletChainSupport,
  walletChainForPpvCluster,
} from "./environment.ts";
import {
  createPpvFactEnvelope,
  isPpvFactEnvelopeV1,
} from "./fact-contract.ts";

const PROGRAMS = {
  core: "9cWE41ZDNQChvFrRoVuPQDeoVLg46ACTiZRCZaBZzfwU",
  commerce: "GmRDoFuPrBrsxnvTX751WK5rLu14JXe4sgjh6vNwHzr3",
  escrow: "7U1bCHQcr8Jg6J8G69JGaAWCRtsrZB1RYx4zo1sNEVF4",
};

const ENVIRONMENT = {
  schemaVersion: 1,
  cluster: "devnet",
  genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  rpcProfileId: "ppv-devnet-primary",
  programs: PROGRAMS,
};

const PREPARED = {
  cluster: "devnet",
  chain: "solana:devnet",
  genesisHash: ENVIRONMENT.genesisHash,
  rpcProfileId: ENVIRONMENT.rpcProfileId,
  programId: PROGRAMS.commerce,
};

test("PPV environment maps devnet to an explicit wallet chain", () => {
  assert.equal(walletChainForPpvCluster("devnet"), "solana:devnet");
  assert.equal(walletChainForPpvCluster("localnet"), null);
});

test("prepared PPV transactions must match cluster, genesis, RPC profile and program", () => {
  const checked = assertPreparedPpvEnvironment({
    expected: ENVIRONMENT,
    prepared: PREPARED,
    layer: "commerce",
  });
  assert.equal(checked.chain, "solana:devnet");

  for (const [field, value, code] of [
    ["cluster", "localnet", "PPV_PREPARED_CLUSTER_MISMATCH"],
    ["chain", "solana:mainnet", "PPV_PREPARED_CHAIN_MISMATCH"],
    ["genesisHash", "DifferentGenesis111111111111111111111111111", "PPV_PREPARED_GENESIS_MISMATCH"],
    ["rpcProfileId", "different-profile", "PPV_PREPARED_RPC_PROFILE_MISMATCH"],
    ["programId", PROGRAMS.core, "PPV_PREPARED_PROGRAM_MISMATCH"],
  ]) {
    assert.throws(
      () =>
        assertPreparedPpvEnvironment({
          expected: ENVIRONMENT,
          prepared: { ...PREPARED, [field]: value },
          layer: "commerce",
        }),
      (error) => error instanceof PpvEnvironmentError && error.code === code,
    );
  }
});

test("wallet capability inspection never pretends supported means active", () => {
  assert.equal(
    inspectWalletChainSupport(
      { standardWallet: { accounts: [{ chains: ["solana:mainnet", "solana:devnet"] }] } },
      "solana:devnet",
    ),
    "supported",
  );
  assert.equal(
    inspectWalletChainSupport(
      { standardWallet: { accounts: [{ chains: ["solana:mainnet"] }] } },
      "solana:devnet",
    ),
    "unsupported",
  );
  assert.equal(inspectWalletChainSupport({}, "solana:devnet"), "unknown");
});

test("canonical PPV fact envelope carries environment provenance without scoring", () => {
  const fact = {
    schemaVersion: 1,
    eventId: `evt_${"a".repeat(40)}`,
    eventType: "proof.created",
    occurredAt: "2026-09-28T12:00:00.000Z",
    eventSource: "chain",
    actorWallet: "11111111111111111111111111111111",
    actorGnsRecord: null,
    counterpartyWallet: null,
    counterpartyGnsRecord: null,
    ppvProofId: "11111111111111111111111111111111",
    proofHash: "b".repeat(64),
    agreementId: null,
    escrowId: null,
    milestoneIndex: null,
    sourceProduct: "ppv",
    sourceObjectId: null,
    deliverableId: null,
    amount: null,
    mint: null,
    outcome: "recorded",
    programId: PROGRAMS.core,
    transactionSignature: "1".repeat(64),
    instructionIndex: 0,
    innerInstructionIndex: 0,
  };

  const envelope = createPpvFactEnvelope({
    environment: ENVIRONMENT,
    fact,
  });
  assert.equal(envelope.environment.cluster, "devnet");
  assert.equal(envelope.fact.eventType, "proof.created");
  assert.equal("score" in envelope.fact, false);
  assert.equal("scoreDelta" in envelope.fact, false);
  assert.equal("trustLabel" in envelope.fact, false);
  assert.equal(isPpvFactEnvelopeV1(envelope), true);
});

test("fact envelope rejects a program outside the declared PPV environment", () => {
  const fact = {
    schemaVersion: 1,
    eventId: `evt_${"c".repeat(40)}`,
    eventType: "proof.created",
    occurredAt: "2026-09-28T12:00:00.000Z",
    eventSource: "chain",
    actorWallet: "11111111111111111111111111111111",
    actorGnsRecord: null,
    counterpartyWallet: null,
    counterpartyGnsRecord: null,
    ppvProofId: "11111111111111111111111111111111",
    proofHash: "d".repeat(64),
    agreementId: null,
    escrowId: null,
    milestoneIndex: null,
    sourceProduct: "ppv",
    sourceObjectId: null,
    deliverableId: null,
    amount: null,
    mint: null,
    outcome: "recorded",
    programId: "11111111111111111111111111111111",
    transactionSignature: "2".repeat(64),
    instructionIndex: 0,
    innerInstructionIndex: 0,
  };

  assert.throws(
    () => createPpvFactEnvelope({ environment: ENVIRONMENT, fact }),
    /does not belong/,
  );
});
