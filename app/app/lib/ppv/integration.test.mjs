import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { after, before, describe, it } from "node:test";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";

/**
 * End-to-end harness: the production PPV client against the real PPV programs.
 *
 * The unit tests verify the client against the *generated IDL*. That catches a
 * wrong discriminator or a mislaid field, but it cannot catch a mistake in how
 * the pieces compose at runtime — account ordering under a real signer, Borsh
 * `Option` framing on a partially-signed agreement, an error code surfaced by a
 * real program, or an expiry measured against a real cluster clock. Those are
 * exactly the seams where this integration first went wrong, so they are what
 * this file exercises.
 *
 * Everything below the wallet signature is the production code path: the
 * `prepare*Transaction` helpers the API routes and the vault UI call, resolving
 * their program ids through the real `config.ts`. A plain `Keypair` stands in
 * for the wallet adapter and nothing else is substituted.
 *
 * Opt-in. Point PPV_PROTOCOL_DIR at a gwapupward-hub/ppv checkout:
 *
 *   PPV_PROTOCOL_DIR=/path/to/ppv \
 *     node --experimental-strip-types --test app/app/lib/ppv/integration.test.mjs
 *
 * Without it the suite skips, so `npm test` is unaffected. PPV_SKIP_BUILD=1
 * reuses an existing `anchor build` when iterating locally.
 */

const protocolDir = process.env.PPV_PROTOCOL_DIR?.trim();
const skip = protocolDir
  ? false
  : "set PPV_PROTOCOL_DIR to a gwapupward-hub/ppv checkout to run this";

const RPC_PORT = Number(process.env.PPV_TEST_VALIDATOR_PORT ?? 8899);
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;

// Anchor 0.30.1 shells out to `cargo +nightly` for IDL generation, and
// anchor-syn calls an unstable API later nightlies removed. Pin it the same way
// ppv/scripts/verify-f1.sh does so the build fails on code, not on a date.
const IDL_TOOLCHAIN = process.env.PPV_IDL_TOOLCHAIN ?? "nightly-2024-06-15";

// `anchor keys sync` rewrites these. They are restored on every exit path so a
// test run never leaves ephemeral ids in the protocol checkout.
const ID_SOURCES = [
  "Anchor.toml",
  "programs/ppv_core/src/lib.rs",
  "programs/ppv_commerce/src/lib.rs",
];

function toolPath() {
  const candidates = [
    process.env.PPV_SOLANA_BIN,
    path.join(process.env.HOME ?? "", ".local/share/solana/install/active_release/bin"),
    "/opt/solana/solana-release/bin",
  ].filter((entry) => entry && existsSync(entry));
  return [...candidates, process.env.PATH].join(path.delimiter);
}

const childEnv = () => ({ ...process.env, PATH: toolPath() });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? protocolDir,
    env: { ...childEnv(), ...(options.env ?? {}) },
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

describe("PPV client against the deployed programs", { skip }, () => {
  /** @type {Connection} */
  let connection;
  /** @type {import("node:child_process").ChildProcess | null} */
  let validator = null;
  let workdir = "";
  /** @type {Record<string, any>} */
  const ppv = {};
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  /** @type {{kind: "proof" | "agreement", pda: PublicKey, data: Buffer}[]} */
  const captured = [];

  before(async () => {
    workdir = mkdtempSync(path.join(tmpdir(), "ppv-integration-"));
    for (const source of ID_SOURCES) {
      const target = path.join(workdir, "ids", source);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(path.join(protocolDir, source), target);
    }

    if (!process.env.PPV_SKIP_BUILD) {
      run("./scripts/prepare-ephemeral-program-ids.sh", []);
      run("anchor", ["build"], { env: { RUSTUP_TOOLCHAIN: IDL_TOOLCHAIN } });
    }

    const programs = {};
    for (const program of ["ppv_core", "ppv_commerce"]) {
      const keypairPath = path.join(protocolDir, "target/deploy", `${program}-keypair.json`);
      const binaryPath = path.join(protocolDir, "target/deploy", `${program}.so`);
      const idlPath = path.join(protocolDir, "target/idl", `${program}.json`);
      assert.ok(existsSync(binaryPath), `${program}.so is missing; run without PPV_SKIP_BUILD`);

      const keypairId = run("solana-keygen", ["pubkey", keypairPath]);
      const { default: idl } = await import(pathToFileURL(idlPath).href, {
        with: { type: "json" },
      });
      // A binary compiled against one id and loaded at another fails every
      // instruction with DeclaredProgramIdMismatch, which reads like a protocol
      // bug and is not one. Catch it here rather than in a test assertion.
      assert.equal(idl.address, keypairId, `${program} was built for a different id`);
      programs[program] = { id: keypairId, keypairPath, binaryPath };
    }

    const ledger = path.join(workdir, "test-ledger");
    validator = spawn(
      "solana-test-validator",
      ["--reset", "--quiet", "--ledger", ledger, "--rpc-port", String(RPC_PORT)],
      { cwd: workdir, env: childEnv(), stdio: "ignore" },
    );

    connection = new Connection(RPC_URL, "confirmed");
    await waitForValidator(connection);

    // A throwaway deployer that exists only for this validator. It signs nothing
    // outside the temp ledger and is destroyed with the working directory.
    const payerPath = path.join(workdir, "deployer.json");
    run("solana-keygen", ["new", "--silent", "--no-bip39-passphrase", "--outfile", payerPath]);
    const payer = run("solana-keygen", ["pubkey", payerPath]);
    run("solana", ["airdrop", "100", payer, "--url", RPC_URL]);

    for (const { keypairPath, binaryPath } of Object.values(programs)) {
      run("solana", [
        "program", "deploy",
        "--url", RPC_URL,
        "--keypair", payerPath,
        "--program-id", keypairPath,
        binaryPath,
      ]);
    }

    // Resolve the production configuration at the local validator. config.ts
    // memoizes on first read, so every env var has to be in place before the
    // modules under test are imported.
    process.env.NEXT_PUBLIC_PPV_CORE_PROGRAM_ID = programs.ppv_core.id;
    process.env.NEXT_PUBLIC_PPV_COMMERCE_PROGRAM_ID = programs.ppv_commerce.id;
    process.env.NEXT_PUBLIC_PPV_RPC_URL = RPC_URL;
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;

    Object.assign(
      ppv,
      await import("./solana.ts"),
      await import("./program.ts"),
      await import("./agreements.ts"),
      await import("./core.ts"),
      await import("../../../lib/ppv/chain-decode.ts"),
    );

    for (const wallet of [alice, bob]) {
      const signature = await connection.requestAirdrop(wallet.publicKey, 10 * LAMPORTS_PER_SOL);
      const { lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      await confirm(signature, lastValidBlockHeight);
    }
  });

  after(async () => {
    if (validator && validator.exitCode === null) {
      validator.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          validator.kill("SIGKILL");
          resolve(undefined);
        }, 10_000);
        validator.once("exit", () => {
          clearTimeout(timer);
          resolve(undefined);
        });
      });
    }
    if (workdir) {
      for (const source of ID_SOURCES) {
        const snapshot = path.join(workdir, "ids", source);
        if (existsSync(snapshot)) cpSync(snapshot, path.join(protocolDir, source));
      }
      rmSync(workdir, { recursive: true, force: true });
    }
  });

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  async function submit(prepared, ...signers) {
    const transaction = Transaction.from(prepared.encodedTransaction);
    transaction.sign(...signers);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      preflightCommitment: "confirmed",
    });
    await confirm(signature, prepared.lastValidBlockHeight);
    return signature;
  }

  /**
   * Poll for confirmation rather than calling `connection.confirmTransaction`.
   * That helper subscribes over the RPC websocket, and web3.js keeps retrying
   * that socket after the validator is gone — which leaves the test process
   * alive long after the last assertion. Polling has no such handle to clean up.
   */
  async function confirm(signature, lastValidBlockHeight) {
    for (;;) {
      const { value } = await connection.getSignatureStatuses([signature]);
      const status = value[0];
      if (status?.err) {
        throw new Error(`${signature} failed on chain: ${JSON.stringify(status.err)}`);
      }
      if (
        status?.confirmationStatus === "confirmed" ||
        status?.confirmationStatus === "finalized"
      ) {
        return;
      }
      if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
        throw new Error(`${signature} expired before it confirmed`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /**
   * Assert the program rejected the transaction, and that the client turned the
   * rejection into the message a person is meant to see. Anything the client
   * cannot name surfaces as null, which fails here rather than silently
   * becoming a generic error in the UI.
   */
  async function expectRejection(work, program, expected) {
    let caught = null;
    try {
      await work();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "expected the program to reject this transaction");

    let described = ppv.describePpvProgramError(caught, program);
    if (described === null && typeof caught.getLogs === "function") {
      caught.logs = await caught.getLogs(connection);
      described = ppv.describePpvProgramError(caught, program);
    }
    assert.equal(described, expected, `unexpected failure: ${caught.message}`);
  }

  async function readProof(pda) {
    const account = await connection.getAccountInfo(pda, "confirmed");
    assert.ok(account, `no account at ${pda.toBase58()}`);
    const data = Buffer.from(account.data);
    captured.push({ kind: "proof", pda, data });
    return {
      client: await ppv.decodeProofRecord(account.data),
      server: ppv.decodeProofAccount(data, pda),
    };
  }

  async function readAgreement(pda) {
    const account = await connection.getAccountInfo(pda, "confirmed");
    assert.ok(account, `no account at ${pda.toBase58()}`);
    const data = Buffer.from(account.data);
    captured.push({ kind: "agreement", pda, data });
    return {
      client: await ppv.decodeAgreementRecord(account.data),
      server: ppv.decodeAgreementAccount(data, pda),
    };
  }

  async function chainNow() {
    const slot = await connection.getSlot("confirmed");
    const blockTime = await connection.getBlockTime(slot);
    assert.ok(blockTime, "the cluster did not report a block time");
    return blockTime;
  }

  async function sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return ppv.bytesToHex(new Uint8Array(digest));
  }

  function draft(revision) {
    return {
      content: {
        title: `Harness agreement ${revision}`,
        summary: `Revision ${revision} of the integration harness agreement.`,
        deliverables: ["A signed commitment", `Revision ${revision}`],
      },
      terms: {
        scope: `Scope for revision ${revision}`,
        compensationNote: "No value moves on chain. PPV Foundation is non-custodial.",
        completionDate: "2026-12-31",
      },
    };
  }

  // --------------------------------------------------------------------------
  // ppv_core
  // --------------------------------------------------------------------------

  const proof = { id: "", pda: null, contentHashHex: "" };

  it("1. records a proof and reads back the hash it committed to", async () => {
    proof.id = ppv.ppvIdToHex(ppv.randomPpvId());
    proof.contentHashHex = await sha256Hex("integration harness content v1");

    const prepared = await ppv.prepareCreateProofTransaction({
      owner: alice.publicKey.toBase58(),
      proofIdHex: proof.id,
      contentHashHex: proof.contentHashHex,
      // All zeroes is the program's "no context commitment". The decoders must
      // report that as absent rather than as a real 32-byte hash.
      contextHashHex: "00".repeat(32),
      kind: "document",
    });
    await submit(prepared, alice);

    proof.pda = new PublicKey(prepared.proofPda);
    assert.deepEqual(
      proof.pda,
      ppv.deriveServerProofPda(
        alice.publicKey,
        ppv.parseProofId(proof.id),
        ppv.getPpvCoreProgramId(),
      ),
      "the client and server derive different proof addresses",
    );

    const { client, server } = await readProof(proof.pda);
    assert.equal(ppv.bytesToHex(client.contentHash), proof.contentHashHex);
    assert.equal(server.contentHash, proof.contentHashHex);
    assert.equal(server.contextHash, null);
    assert.equal(client.status, "active");
    assert.equal(server.revoked, false);
    assert.equal(server.revokedAt, null);
    assert.equal(server.authority, alice.publicKey.toBase58());
    assert.equal(client.kind, "document");
    assert.ok(server.createdAt > 0);
  });

  it("2. refuses a revocation from a wallet that is not the authority", async () => {
    const prepared = await ppv.prepareRevokeProofTransaction({
      owner: bob.publicKey.toBase58(),
      proofPda: proof.pda.toBase58(),
    });
    await expectRejection(
      () => submit(prepared, bob),
      "core",
      "That wallet is not this proof's authority.",
    );

    const { server } = await readProof(proof.pda);
    assert.equal(server.revoked, false, "a rejected revocation must not change state");
  });

  it("3. revokes as the authority and timestamps it", async () => {
    const prepared = await ppv.prepareRevokeProofTransaction({
      owner: alice.publicKey.toBase58(),
      proofPda: proof.pda.toBase58(),
    });
    await submit(prepared, alice);

    const { client, server } = await readProof(proof.pda);
    assert.equal(client.status, "revoked");
    assert.equal(server.revoked, true);
    assert.ok(server.revokedAt && server.revokedAt >= server.createdAt);
    assert.equal(
      server.contentHash,
      proof.contentHashHex,
      "revocation must not disturb the commitment",
    );
  });

  it("4. treats revocation as final", async () => {
    const prepared = await ppv.prepareRevokeProofTransaction({
      owner: alice.publicKey.toBase58(),
      proofPda: proof.pda.toBase58(),
    });
    await expectRejection(
      () => submit(prepared, alice),
      "core",
      "This proof is already revoked. Revocation is final.",
    );
  });

  // --------------------------------------------------------------------------
  // ppv_commerce
  // --------------------------------------------------------------------------

  const agreement = { id: "", pda: null, v1: null, v2: null };

  it("5. opens an agreement between two wallets, unsigned", async () => {
    agreement.id = ppv.ppvIdToHex(ppv.randomPpvId());
    agreement.v1 = await ppv.hashAgreementDraft(draft(1).content, draft(1).terms);

    const now = await chainNow();
    const expiresAt = ppv.resolveExpiry(
      new Date((now + 30 * 24 * 60 * 60) * 1000).toISOString().slice(0, 10),
      now,
    );

    const prepared = await ppv.prepareCreateAgreementTransaction({
      partyA: alice.publicKey.toBase58(),
      partyB: bob.publicKey.toBase58(),
      agreementIdHex: agreement.id,
      contentHashHex: agreement.v1.contentHashHex,
      termsHashHex: agreement.v1.termsHashHex,
      expiresAt,
    });
    await submit(prepared, alice);

    agreement.pda = new PublicKey(prepared.agreementPda);
    assert.deepEqual(
      agreement.pda,
      ppv.deriveServerAgreementPda(
        alice.publicKey,
        ppv.parseProofId(agreement.id),
        ppv.getPpvCommerceProgramId(),
      ),
      "the client and server derive different agreement addresses",
    );

    const { client, server } = await readAgreement(agreement.pda);
    assert.equal(server.state, "pending");
    assert.equal(server.version, 1);
    assert.equal(server.signatureA, null);
    assert.equal(server.signatureB, null);
    assert.equal(server.partyA, alice.publicKey.toBase58());
    assert.equal(server.partyB, bob.publicKey.toBase58());
    assert.equal(server.contentHash, agreement.v1.contentHashHex);
    assert.equal(server.termsHash, agreement.v1.termsHashHex);
    assert.equal(server.expiresAt, Number(expiresAt));
    assert.equal(client.sigA, null);
    assert.equal(client.sigB, null);
    assert.equal(server.executedAt, null);
    assert.equal(server.cancelledAt, null);
  });

  it("6. records one party's signature without executing", async () => {
    const prepared = await ppv.prepareSignAgreementTransaction({
      signer: alice.publicKey.toBase58(),
      agreementPda: agreement.pda.toBase58(),
      expectedVersion: 1,
      expectedContentHashHex: agreement.v1.contentHashHex,
      expectedTermsHashHex: agreement.v1.termsHashHex,
    });
    await submit(prepared, alice);

    const { client, server } = await readAgreement(agreement.pda);
    assert.equal(server.state, "pending", "one signature must not execute an agreement");
    assert.ok(server.signatureA, "party A's signature slot is empty");
    assert.equal(server.signatureA.signer, alice.publicKey.toBase58());
    assert.equal(server.signatureA.versionSigned, 1);
    assert.equal(server.signatureA.contentHashSigned, agreement.v1.contentHashHex);
    assert.equal(server.signatureA.termsHashSigned, agreement.v1.termsHashHex);
    // A present Option is 1 tag byte plus 104 bytes of record. Every field after
    // it shifts, so an absent sigB read through a present sigA is the framing
    // case no fixed-offset unit test covers.
    assert.equal(server.signatureB, null);
    assert.ok(client.sigA);
    assert.equal(client.sigB, null);
  });

  it("7. clears every signature when a revision lands", async () => {
    agreement.v2 = await ppv.hashAgreementDraft(draft(2).content, draft(2).terms);
    assert.notEqual(agreement.v2.contentHashHex, agreement.v1.contentHashHex);

    const prepared = await ppv.prepareProposeRevisionTransaction({
      signer: bob.publicKey.toBase58(),
      agreementPda: agreement.pda.toBase58(),
      expectedVersion: 1,
      newContentHashHex: agreement.v2.contentHashHex,
      newTermsHashHex: agreement.v2.termsHashHex,
    });
    await submit(prepared, bob);

    const { client, server } = await readAgreement(agreement.pda);
    assert.equal(server.version, 2);
    assert.equal(server.state, "pending");
    assert.equal(server.contentHash, agreement.v2.contentHashHex);
    assert.equal(server.termsHash, agreement.v2.termsHashHex);
    assert.equal(server.signatureA, null, "a revision must not carry a signature forward");
    assert.equal(server.signatureB, null);
    assert.equal(client.sigA, null);
    assert.equal(client.sigB, null);
  });

  it("8. rejects a signature that names a version the agreement has moved past", async () => {
    const prepared = await ppv.prepareSignAgreementTransaction({
      signer: alice.publicKey.toBase58(),
      agreementPda: agreement.pda.toBase58(),
      expectedVersion: 1,
      expectedContentHashHex: agreement.v1.contentHashHex,
      expectedTermsHashHex: agreement.v1.termsHashHex,
    });
    await expectRejection(
      () => submit(prepared, alice),
      "commerce",
      "The agreement moved on. You were signing an older version — reload and review the current one.",
    );

    const { server } = await readAgreement(agreement.pda);
    assert.equal(server.signatureA, null, "a rejected signature must not be recorded");
    assert.equal(server.version, 2);
  });

  it("9. executes once both parties sign the current version", async () => {
    for (const wallet of [alice, bob]) {
      const prepared = await ppv.prepareSignAgreementTransaction({
        signer: wallet.publicKey.toBase58(),
        agreementPda: agreement.pda.toBase58(),
        expectedVersion: 2,
        expectedContentHashHex: agreement.v2.contentHashHex,
        expectedTermsHashHex: agreement.v2.termsHashHex,
      });
      await submit(prepared, wallet);
    }

    const { client, server } = await readAgreement(agreement.pda);
    assert.equal(server.state, "executed");
    assert.ok(server.executedAt && server.executedAt > 0);
    assert.equal(server.cancelledAt, null);
    assert.ok(server.signatureA && server.signatureB);
    assert.equal(server.signatureA.versionSigned, 2);
    assert.equal(server.signatureB.versionSigned, 2);
    assert.equal(server.signatureB.signer, bob.publicKey.toBase58());
    assert.equal(client.state, "executed");
  });

  it("10. freezes an executed agreement against signing, revision and cancellation", async () => {
    const frozen = "The agreement is no longer pending, so it cannot be changed.";
    const pda = agreement.pda.toBase58();

    await expectRejection(
      async () =>
        submit(
          await ppv.prepareSignAgreementTransaction({
            signer: alice.publicKey.toBase58(),
            agreementPda: pda,
            expectedVersion: 2,
            expectedContentHashHex: agreement.v2.contentHashHex,
            expectedTermsHashHex: agreement.v2.termsHashHex,
          }),
          alice,
        ),
      "commerce",
      frozen,
    );

    await expectRejection(
      async () =>
        submit(
          await ppv.prepareProposeRevisionTransaction({
            signer: bob.publicKey.toBase58(),
            agreementPda: pda,
            expectedVersion: 2,
            newContentHashHex: await sha256Hex("a revision after execution"),
            newTermsHashHex: await sha256Hex("terms after execution"),
          }),
          bob,
        ),
      "commerce",
      frozen,
    );

    await expectRejection(
      async () =>
        submit(
          await ppv.prepareCancelAgreementTransaction({
            signer: alice.publicKey.toBase58(),
            agreementPda: pda,
          }),
          alice,
        ),
      "commerce",
      frozen,
    );

    const { server } = await readAgreement(agreement.pda);
    assert.equal(server.state, "executed");
    assert.equal(server.version, 2);
  });

  it("11. cancels a pending agreement and freezes it too", async () => {
    const id = ppv.ppvIdToHex(ppv.randomPpvId());
    const hashes = await ppv.hashAgreementDraft(draft(3).content, draft(3).terms);
    const now = await chainNow();
    const expiresAt = ppv.resolveExpiry(
      new Date((now + 7 * 24 * 60 * 60) * 1000).toISOString().slice(0, 10),
      now,
    );

    const created = await ppv.prepareCreateAgreementTransaction({
      partyA: alice.publicKey.toBase58(),
      partyB: bob.publicKey.toBase58(),
      agreementIdHex: id,
      contentHashHex: hashes.contentHashHex,
      termsHashHex: hashes.termsHashHex,
      expiresAt,
    });
    await submit(created, alice);
    const pda = new PublicKey(created.agreementPda);

    // Either party can cancel while it is pending; here the counterparty does.
    await submit(
      await ppv.prepareCancelAgreementTransaction({
        signer: bob.publicKey.toBase58(),
        agreementPda: pda.toBase58(),
      }),
      bob,
    );

    const { client, server } = await readAgreement(pda);
    assert.equal(server.state, "cancelled");
    assert.ok(server.cancelledAt && server.cancelledAt > 0);
    assert.equal(server.executedAt, null);
    assert.equal(client.state, "cancelled");

    await expectRejection(
      async () =>
        submit(
          await ppv.prepareSignAgreementTransaction({
            signer: alice.publicKey.toBase58(),
            agreementPda: pda.toBase58(),
            expectedVersion: 1,
            expectedContentHashHex: hashes.contentHashHex,
            expectedTermsHashHex: hashes.termsHashHex,
          }),
          alice,
        ),
      "commerce",
      "The agreement is no longer pending, so it cannot be changed.",
    );
  });

  // --------------------------------------------------------------------------
  // Parity
  // --------------------------------------------------------------------------

  it("12. the browser and server decoders agree on every account read above", () => {
    assert.ok(captured.length >= 10, `only ${captured.length} accounts were captured`);

    return Promise.all(
      captured.map(async ({ kind, pda, data }) => {
        if (kind === "proof") {
          assertProofParity(await ppv.decodeProofRecord(data), ppv.decodeProofAccount(data, pda), pda);
        } else {
          assertAgreementParity(
            await ppv.decodeAgreementRecord(data),
            ppv.decodeAgreementAccount(data, pda),
            pda,
          );
        }
      }),
    );
  });

  function assertProofParity(client, server, pda) {
    const contextHex = ppv.bytesToHex(client.contextHash);
    assert.equal(ppv.ppvIdToHex(client.proofId), server.proofId);
    assert.equal(pda.toBase58(), server.proofPda);
    assert.equal(client.authority.toBase58(), server.authority);
    assert.equal(ppv.bytesToHex(client.contentHash), server.contentHash);
    assert.equal(/^0+$/.test(contextHex) ? null : contextHex, server.contextHash);
    assert.equal(client.kind, server.kind);
    assert.equal(client.status === "revoked", server.revoked);
    assert.equal(Number(client.createdAt), server.createdAt);
    assert.equal(
      client.status === "revoked" ? Number(client.revokedAt) : null,
      server.revokedAt,
    );
  }

  function assertAgreementParity(client, server, pda) {
    assert.equal(ppv.ppvIdToHex(client.agreementId), server.agreementId);
    assert.equal(pda.toBase58(), server.agreementPda);
    assert.equal(client.partyA.toBase58(), server.partyA);
    assert.equal(client.partyB.toBase58(), server.partyB);
    assert.equal(client.version, server.version);
    assert.equal(ppv.bytesToHex(client.contentHash), server.contentHash);
    assert.equal(ppv.bytesToHex(client.termsHash), server.termsHash);
    assertSignatureParity(client.sigA, server.signatureA);
    assertSignatureParity(client.sigB, server.signatureB);
    assert.equal(client.state, server.state);
    assert.equal(Number(client.createdAt), server.createdAt);
    assert.equal(Number(client.expiresAt), server.expiresAt);
    assert.equal(
      client.state === "executed" ? Number(client.executedAt) : null,
      server.executedAt,
    );
    assert.equal(
      client.state === "cancelled" ? Number(client.cancelledAt) : null,
      server.cancelledAt,
    );
  }

  function assertSignatureParity(client, server) {
    if (client === null) {
      assert.equal(server, null);
      return;
    }
    assert.ok(server, "the server decoder dropped a signature the client found");
    assert.equal(client.signer.toBase58(), server.signer);
    assert.equal(client.versionSigned, server.versionSigned);
    assert.equal(ppv.bytesToHex(client.contentHashSigned), server.contentHashSigned);
    assert.equal(ppv.bytesToHex(client.termsHashSigned), server.termsHashSigned);
    assert.equal(Number(client.signedAt), server.signedAt);
  }
});

async function waitForValidator(connection) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      await connection.getVersion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`solana-test-validator did not become ready on ${RPC_URL}`);
}
