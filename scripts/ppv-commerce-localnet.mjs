import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import {
  buildCreateCommerceAgreementInstruction,
  buildCreateProofInstruction,
  buildReviseCommerceAgreementInstruction,
  buildSignCommerceAgreementInstruction,
  deriveCommerceAgreement,
  deriveCoreProofRecord,
} from "../app/lib/ppv-sdk/instructions.ts";
import {
  bytesToHex,
  hashDocumentV1,
} from "../app/lib/ppv-sdk/canonical.ts";
import {
  decodeAgreement,
  decodeProofRecord,
} from "../app/lib/ppv-reputation-accounts.ts";
import { assertCommerceEscrowBinding } from "../app/lib/ppv/commerce-binding.ts";

const rpcUrl = process.env.PPV_LOCALNET_RPC_URL ?? "http://127.0.0.1:8899";
const coreProgramIdText = process.env.PPV_LOCALNET_CORE_PROGRAM_ID;
const commerceProgramIdText = process.env.PPV_LOCALNET_COMMERCE_PROGRAM_ID;
const reportPath =
  process.env.PPV_LOCALNET_REPORT_PATH ??
  "artifacts/ppv-commerce-localnet-report.json";

if (!coreProgramIdText || !commerceProgramIdText) {
  throw new Error(
    "PPV_LOCALNET_CORE_PROGRAM_ID and PPV_LOCALNET_COMMERCE_PROGRAM_ID are required",
  );
}

const connection = new Connection(rpcUrl, "finalized");
const coreProgramId = new PublicKey(coreProgramIdText);
const commerceProgramId = new PublicKey(commerceProgramIdText);

function web3Instruction(spec) {
  return new TransactionInstruction({
    programId: new PublicKey(spec.programId),
    keys: spec.accounts.map((account) => ({
      pubkey: new PublicKey(account.address),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(spec.data),
  });
}

function randomId16() {
  return new Uint8Array(randomBytes(16));
}

async function finalizedBlockTime() {
  const slot = await connection.getSlot("finalized");
  const blockTime = await connection.getBlockTime(slot);
  if (blockTime === null) throw new Error("local validator returned no block time");
  return blockTime;
}

async function fund(wallet) {
  const latest = await connection.getLatestBlockhash("finalized");
  const signature = await connection.requestAirdrop(
    wallet.publicKey,
    2 * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction({ signature, ...latest }, "finalized");
}

async function send(spec, signers) {
  const latest = await connection.getLatestBlockhash("finalized");
  const transaction = new Transaction({
    feePayer: signers[0].publicKey,
    recentBlockhash: latest.blockhash,
  }).add(web3Instruction(spec));

  return sendAndConfirmTransaction(connection, transaction, signers, {
    commitment: "finalized",
    preflightCommitment: "finalized",
    skipPreflight: false,
  });
}

async function expectRejected(label, operation) {
  try {
    await operation();
  } catch {
    return { label, rejected: true };
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function readAgreement(address) {
  const info = await connection.getAccountInfo(new PublicKey(address), "finalized");
  if (!info) throw new Error(`missing Commerce agreement ${address}`);
  if (!info.owner.equals(commerceProgramId)) {
    throw new Error("Commerce agreement owner mismatch");
  }
  const decoded = decodeAgreement(new Uint8Array(info.data));
  if (!decoded) throw new Error("Commerce agreement decoder rejected account");
  return decoded;
}

async function readProof(address) {
  const info = await connection.getAccountInfo(new PublicKey(address), "finalized");
  if (!info) throw new Error(`missing Core proof ${address}`);
  if (!info.owner.equals(coreProgramId)) throw new Error("Core proof owner mismatch");
  const decoded = decodeProofRecord(new Uint8Array(info.data));
  if (!decoded) throw new Error("Core proof decoder rejected account");
  return decoded;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const genesisHash = await connection.getGenesisHash();
const partyA = Keypair.generate();
const partyB = Keypair.generate();
await Promise.all([fund(partyA), fund(partyB)]);

const contentV1 = {
  title: "GWAP localnet Commerce acceptance",
  body: "Two wallets approve the exact current agreement version.",
};
const termsV1 = {
  buyerWallet: partyA.publicKey.toBase58(),
  sellerWallet: partyB.publicKey.toBase58(),
  mint: "LocalnetTestMint111111111111111111111111111",
  amountBaseUnits: "2500000",
  scheduleHash: "11".repeat(32),
  paymentMode: "test-only",
};
const contentV2 = {
  ...contentV1,
  body: "Version two requires both wallets to review and sign again.",
};
const termsV2 = {
  ...termsV1,
  amountBaseUnits: "2750000",
  scheduleHash: "22".repeat(32),
};

const [contentHashV1, termsHashV1, contentHashV2, termsHashV2] =
  await Promise.all([
    hashDocumentV1(contentV1),
    hashDocumentV1(termsV1),
    hashDocumentV1(contentV2),
    hashDocumentV1(termsV2),
  ]);

const signatures = {};
const fixtures = {};
const assertions = [];

// C01 — two independent parties sign the exact current document/version.
{
  const agreementId = randomId16();
  const agreement = deriveCommerceAgreement(
    commerceProgramIdText,
    partyA.publicKey.toBase58(),
    agreementId,
  );
  const expiresAt = String((await finalizedBlockTime()) + 3600);

  signatures.c01Create = await send(
    buildCreateCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      partyA: partyA.publicKey.toBase58(),
      partyB: partyB.publicKey.toBase58(),
      agreementId,
      contentHash: contentHashV1,
      termsHash: termsHashV1,
      expiresAt,
    }),
    [partyA],
  );

  signatures.c01SignA = await send(
    buildSignCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      signer: partyA.publicKey.toBase58(),
      agreement,
      expectedVersion: 1,
      contentHash: contentHashV1,
      termsHash: termsHashV1,
    }),
    [partyA],
  );

  const afterA = await readAgreement(agreement);
  assertEqual(afterA.state, "pending", "C01 state after party A");
  assertEqual(afterA.sigA?.signer, partyA.publicKey.toBase58(), "C01 party A signer");
  assertEqual(afterA.sigB, null, "C01 party B signature before signing");

  signatures.c01SignB = await send(
    buildSignCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      signer: partyB.publicKey.toBase58(),
      agreement,
      expectedVersion: 1,
      contentHash: contentHashV1,
      termsHash: termsHashV1,
    }),
    [partyB],
  );

  const executed = await readAgreement(agreement);
  assertEqual(executed.state, "executed", "C01 executed state");
  assertEqual(executed.version, 1, "C01 version");
  assertEqual(executed.contentHash, bytesToHex(contentHashV1), "C01 content hash");
  assertEqual(executed.termsHash, bytesToHex(termsHashV1), "C01 terms hash");
  assertEqual(executed.sigA?.versionSigned, 1, "C01 party A signed version");
  assertEqual(executed.sigB?.versionSigned, 1, "C01 party B signed version");

  fixtures.c01Agreement = agreement;
  assertions.push("C01 exact-version two-party execution passed");

  // Core binds the same terms to this exact Commerce agreement address.
  const proofId = randomId16();
  const proof = deriveCoreProofRecord(
    coreProgramIdText,
    partyA.publicKey.toBase58(),
    proofId,
  );
  signatures.c01CoreProof = await send(
    buildCreateProofInstruction({
      programId: coreProgramIdText,
      authority: partyA.publicKey.toBase58(),
      proofId,
      contentHash: termsHashV1,
      contextHash: new PublicKey(agreement).toBytes(),
      kind: "agreement",
    }),
    [partyA],
  );
  const proofRecord = await readProof(proof);
  assertEqual(proofRecord.contentHash, executed.termsHash, "Core/Commerce terms binding");
  assertEqual(
    proofRecord.contextHash,
    Buffer.from(new PublicKey(agreement).toBytes()).toString("hex"),
    "Core/Commerce agreement context binding",
  );
  fixtures.c01CoreProof = proof;
  assertions.push("Core/Commerce exact terms + agreement-address binding passed");

  // C04 — application-level Commerce → Escrow binding must refuse drift.
  const reviewedTerms = {
    buyerWallet: partyA.publicKey.toBase58(),
    sellerWallet: partyB.publicKey.toBase58(),
    mint: termsV1.mint,
    amountBaseUnits: termsV1.amountBaseUnits,
    scheduleHash: termsV1.scheduleHash,
  };
  const validBinding = assertCommerceEscrowBinding({
    agreement: executed,
    reviewedContentHash: bytesToHex(contentHashV1),
    reviewedTermsHash: bytesToHex(termsHashV1),
    reviewedTerms,
    escrow: { ...reviewedTerms },
  });
  assertEqual(validBinding.ok, true, "C04 valid binding");

  for (const [label, escrow] of [
    ["amount", { ...reviewedTerms, amountBaseUnits: "2500001" }],
    ["mint", { ...reviewedTerms, mint: "DifferentLocalnetMint" }],
    ["schedule", { ...reviewedTerms, scheduleHash: "33".repeat(32) }],
  ]) {
    let rejected = false;
    try {
      assertCommerceEscrowBinding({
        agreement: executed,
        reviewedContentHash: bytesToHex(contentHashV1),
        reviewedTermsHash: bytesToHex(termsHashV1),
        reviewedTerms,
        escrow,
      });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`C04 ${label} mismatch was not rejected`);
  }
  assertions.push("C04 amount/mint/schedule drift rejection passed");
}

// C02/C03 — revision clears signatures; stale cached operations fail.
{
  const agreementId = randomId16();
  const agreement = deriveCommerceAgreement(
    commerceProgramIdText,
    partyA.publicKey.toBase58(),
    agreementId,
  );
  const expiresAt = String((await finalizedBlockTime()) + 3600);

  signatures.c02Create = await send(
    buildCreateCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      partyA: partyA.publicKey.toBase58(),
      partyB: partyB.publicKey.toBase58(),
      agreementId,
      contentHash: contentHashV1,
      termsHash: termsHashV1,
      expiresAt,
    }),
    [partyA],
  );

  signatures.c02SignAOnV1 = await send(
    buildSignCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      signer: partyA.publicKey.toBase58(),
      agreement,
      expectedVersion: 1,
      contentHash: contentHashV1,
      termsHash: termsHashV1,
    }),
    [partyA],
  );

  signatures.c02ReviseToV2 = await send(
    buildReviseCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      signer: partyB.publicKey.toBase58(),
      agreement,
      expectedVersion: 1,
      contentHash: contentHashV2,
      termsHash: termsHashV2,
    }),
    [partyB],
  );

  const revised = await readAgreement(agreement);
  assertEqual(revised.version, 2, "C02 revised version");
  assertEqual(revised.sigA, null, "C02 stale party A signature cleared");
  assertEqual(revised.sigB, null, "C02 party B signature clear");
  assertEqual(revised.state, "pending", "C02 revised state");

  const staleSign = await expectRejected("C03 stale version signature", () =>
    send(
      buildSignCommerceAgreementInstruction({
        programId: commerceProgramIdText,
        signer: partyA.publicKey.toBase58(),
        agreement,
        expectedVersion: 1,
        contentHash: contentHashV1,
        termsHash: termsHashV1,
      }),
      [partyA],
    ),
  );

  const staleRevision = await expectRejected("C03 stale revision", () =>
    send(
      buildReviseCommerceAgreementInstruction({
        programId: commerceProgramIdText,
        signer: partyA.publicKey.toBase58(),
        agreement,
        expectedVersion: 1,
        contentHash: contentHashV1,
        termsHash: termsHashV1,
      }),
      [partyA],
    ),
  );

  signatures.c02SignAOnV2 = await send(
    buildSignCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      signer: partyA.publicKey.toBase58(),
      agreement,
      expectedVersion: 2,
      contentHash: contentHashV2,
      termsHash: termsHashV2,
    }),
    [partyA],
  );
  signatures.c02SignBOnV2 = await send(
    buildSignCommerceAgreementInstruction({
      programId: commerceProgramIdText,
      signer: partyB.publicKey.toBase58(),
      agreement,
      expectedVersion: 2,
      contentHash: contentHashV2,
      termsHash: termsHashV2,
    }),
    [partyB],
  );

  const executed = await readAgreement(agreement);
  assertEqual(executed.state, "executed", "C02 v2 execution");
  assertEqual(executed.version, 2, "C02 final version");
  assertEqual(executed.contentHash, bytesToHex(contentHashV2), "C02 v2 content");
  assertEqual(executed.termsHash, bytesToHex(termsHashV2), "C02 v2 terms");

  fixtures.c02Agreement = agreement;
  assertions.push("C02 revision clears signatures and requires fresh v2 signatures");
  assertions.push(staleSign.label + " passed");
  assertions.push(staleRevision.label + " passed");
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: "GWAPSpot Commerce localnet acceptance harness",
  cluster: "localnet",
  rpcUrl,
  genesisHash,
  sourcePins: {
    gwapspotCommit: process.env.GITHUB_SHA ?? null,
    ppvPackage: "7c4ea67a9b6d69ab85a20f497eb0c2a31b48cfd2",
  },
  programs: {
    core: coreProgramIdText,
    commerce: commerceProgramIdText,
  },
  actors: {
    partyA: partyA.publicKey.toBase58(),
    partyB: partyB.publicKey.toBase58(),
  },
  fixtures,
  signatures,
  assertions,
  acceptance: {
    C01: "PASS",
    C02: "PASS",
    C03: "PASS",
    C04: "PASS",
    C05: "NOT_APPLICABLE_LOCALNET_PROGRAM_PRESENT",
  },
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
