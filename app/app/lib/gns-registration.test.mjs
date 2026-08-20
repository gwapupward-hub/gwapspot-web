import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "buffer";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  CANONICAL_GNS_PROGRAM_ID,
  CANONICAL_GNS_TREASURY,
  GNS_MIGRATE_RESERVED_DISCRIMINATOR,
  GNS_REGISTER_DISCRIMINATOR,
  buildGnsRegistrationTransaction,
  buildGnsReservedMigrationTransaction,
  deriveGnsRegistrationAccounts,
  encodeGnsSignature,
  getGnsExplorerUrl,
  getGnsProtocolVersion,
  isGnsRegistrationConfig,
  isValidGnsName,
  isValidSolanaSignature,
  normalizeGnsName,
  parsePendingGnsRegistration,
} from "./gns-registration.ts";

const config = {
  feeLamports: 10_000_000,
  feeSol: 0.01,
  network: "devnet",
  onChainMode: true,
  programId: CANONICAL_GNS_PROGRAM_ID,
  treasury: CANONICAL_GNS_TREASURY,
};

const rolloutConfig = {
  ...config,
  network: "mainnet-beta",
  protocolVersion: "rollout-v1",
  publicRegistrationEnabled: true,
  migrationEnabled: true,
};

test("normalizes and validates the exact GNS name rules", () => {
  assert.equal(normalizeGnsName("  Builder.GWAP  "), "builder");
  assert.equal(isValidGnsName("a"), true);
  assert.equal(isValidGnsName("gwap-builder-01"), true);
  assert.equal(isValidGnsName("a".repeat(32)), true);
  assert.equal(isValidGnsName("a".repeat(33)), false);
  assert.equal(isValidGnsName("-builder"), false);
  assert.equal(isValidGnsName("builder-"), false);
  assert.equal(isValidGnsName("gwap_builder"), false);
});

test("keeps legacy configuration backwards compatible", () => {
  assert.equal(getGnsProtocolVersion(config), "legacy-v1");
  assert.equal(isGnsRegistrationConfig(config), true);
  assert.equal(isGnsRegistrationConfig({ ...config, protocolVersion: "bad" }), false);
});

test("builds the canonical legacy Anchor register instruction", () => {
  const owner = new PublicKey(Uint8Array.from({ length: 32 }, () => 7));
  const transaction = buildGnsRegistrationTransaction({
    config,
    name: "builder",
    owner,
  });
  const instruction = transaction.instructions[0];
  const accounts = deriveGnsRegistrationAccounts("builder", config);

  assert.equal(transaction.instructions.length, 1);
  assert.equal(transaction.feePayer?.toBase58(), owner.toBase58());
  assert.equal(instruction.programId.toBase58(), CANONICAL_GNS_PROGRAM_ID);
  assert.deepEqual(
    instruction.keys.map(({ pubkey, isSigner, isWritable }) => ({
      pubkey: pubkey.toBase58(),
      isSigner,
      isWritable,
    })),
    [
      { pubkey: owner.toBase58(), isSigner: true, isWritable: true },
      { pubkey: accounts.configPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: CANONICAL_GNS_TREASURY, isSigner: false, isWritable: true },
      { pubkey: accounts.namePda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
  );
  assert.deepEqual(
    instruction.data.subarray(0, 8),
    Buffer.from(GNS_REGISTER_DISCRIMINATOR),
  );
  assert.equal(instruction.data.readUInt32LE(8), 7);
  assert.equal(instruction.data.subarray(12).toString("utf8"), "builder");
});

test("builds rollout-v1 public registration with reservation guard accounts", () => {
  const owner = new PublicKey(Uint8Array.from({ length: 32 }, () => 7));
  const transaction = buildGnsRegistrationTransaction({
    config: rolloutConfig,
    name: "builder",
    owner,
  });
  const instruction = transaction.instructions[0];
  const accounts = deriveGnsRegistrationAccounts("builder", rolloutConfig);

  assert.deepEqual(
    instruction.keys.map(({ pubkey, isSigner, isWritable }) => ({
      pubkey: pubkey.toBase58(),
      isSigner,
      isWritable,
    })),
    [
      { pubkey: owner.toBase58(), isSigner: true, isWritable: true },
      { pubkey: accounts.configPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: accounts.rolloutPda.toBase58(), isSigner: false, isWritable: false },
      { pubkey: CANONICAL_GNS_TREASURY, isSigner: false, isWritable: true },
      { pubkey: accounts.legacyReservationPda.toBase58(), isSigner: false, isWritable: false },
      { pubkey: accounts.namePda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
  );
  assert.deepEqual(
    instruction.data.subarray(0, 8),
    Buffer.from(GNS_REGISTER_DISCRIMINATOR),
  );
});

test("refuses rollout public registration while its gate is closed", () => {
  const owner = new PublicKey(Uint8Array.from({ length: 32 }, () => 7));
  assert.throws(
    () =>
      buildGnsRegistrationTransaction({
        config: { ...rolloutConfig, publicRegistrationEnabled: false },
        name: "builder",
        owner,
      }),
    /public registration is not enabled/i,
  );
});

test("builds the protected migrate_reserved instruction", () => {
  const owner = new PublicKey(Uint8Array.from({ length: 32 }, () => 8));
  const transaction = buildGnsReservedMigrationTransaction({
    config: rolloutConfig,
    name: "builder",
    owner,
  });
  const instruction = transaction.instructions[0];
  const accounts = deriveGnsRegistrationAccounts("builder", rolloutConfig);

  assert.deepEqual(
    instruction.keys.map(({ pubkey, isSigner, isWritable }) => ({
      pubkey: pubkey.toBase58(),
      isSigner,
      isWritable,
    })),
    [
      { pubkey: owner.toBase58(), isSigner: true, isWritable: true },
      { pubkey: accounts.configPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: accounts.rolloutPda.toBase58(), isSigner: false, isWritable: false },
      { pubkey: CANONICAL_GNS_TREASURY, isSigner: false, isWritable: true },
      { pubkey: accounts.legacyReservationPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: accounts.namePda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
  );
  assert.deepEqual(
    instruction.data.subarray(0, 8),
    Buffer.from(GNS_MIGRATE_RESERVED_DISCRIMINATOR),
  );
  assert.equal(instruction.data.readUInt32LE(8), 7);
  assert.equal(instruction.data.subarray(12).toString("utf8"), "builder");
});

test("refuses protected migration unless rollout-v1 migration is enabled", () => {
  const owner = new PublicKey(Uint8Array.from({ length: 32 }, () => 8));
  assert.throws(
    () => buildGnsReservedMigrationTransaction({ config, name: "builder", owner }),
    /does not support protected migrations/i,
  );
  assert.throws(
    () =>
      buildGnsReservedMigrationTransaction({
        config: { ...rolloutConfig, migrationEnabled: false },
        name: "builder",
        owner,
      }),
    /migration is not enabled/i,
  );
});

test("encodes Privy signatures and devnet explorer links", () => {
  const signature = encodeGnsSignature(
    Uint8Array.from({ length: 64 }, (_, index) => index + 1),
  );
  assert.equal(isValidSolanaSignature(signature), true);
  assert.equal(isValidSolanaSignature("2".repeat(80)), false);
  assert.match(
    getGnsExplorerUrl(signature, "devnet"),
    /explorer\.solana\.com\/tx\/.+cluster=devnet/,
  );
});

test("restores only a valid pending receipt for the authenticated wallet", () => {
  const owner = new PublicKey(Uint8Array.from({ length: 32 }, () => 9)).toBase58();
  const signature = encodeGnsSignature(
    Uint8Array.from({ length: 64 }, (_, index) => index + 1),
  );
  const pending = {
    config,
    name: "builder",
    owner,
    signature,
    submittedAt: new Date().toISOString(),
  };

  assert.equal(isGnsRegistrationConfig(config), true);
  assert.equal(isGnsRegistrationConfig({ ...config, feeSol: 1 }), false);
  assert.deepEqual(parsePendingGnsRegistration(pending, owner), pending);
  assert.equal(parsePendingGnsRegistration(pending, CANONICAL_GNS_TREASURY), null);
  assert.equal(
    parsePendingGnsRegistration({ ...pending, signature: "2".repeat(80) }, owner),
    null,
  );
  assert.equal(
    parsePendingGnsRegistration(
      {
        ...pending,
        submittedAt: new Date(
          Date.now() - 25 * 60 * 60 * 1_000,
        ).toISOString(),
      },
      owner,
    ),
    null,
  );
});
