import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { hexToBytes } from "./core.ts";
import {
  PPV_CLUSTER,
  getPpvConfig,
  readPpvConfig,
} from "./config.ts";
import {
  type ProofKind,
  cancelAgreementInstruction,
  createAgreementInstruction,
  createProofInstruction,
  findAgreementAddress,
  findProofAddress,
  proposeRevisionInstruction,
  revokeProofInstruction,
  signAgreementInstruction,
} from "./program.ts";

export type PpvCluster = typeof PPV_CLUSTER;

export function getPpvCluster(): PpvCluster {
  return PPV_CLUSTER;
}

export function getPpvRpcUrl() {
  return getPpvConfig().rpcUrl;
}

export function getPpvConnection() {
  return new Connection(getPpvRpcUrl(), "confirmed");
}

export function getPpvCoreProgramId() {
  return getPpvConfig().coreProgramId;
}

export function getPpvCommerceProgramId() {
  return getPpvConfig().commerceProgramId;
}

export function isPpvConfigured() {
  return readPpvConfig().ok;
}

/**
 * Proof accounts are namespaced by the authority wallet as well as the proof id,
 * so the same id under two wallets is two different accounts and one wallet can
 * never occupy another's address. Callers must therefore know the owner; a proof
 * id alone does not identify an account.
 */
export function derivePpvProofPda(
  owner: PublicKey,
  proofId: Uint8Array,
  programId = getPpvCoreProgramId(),
) {
  return findProofAddress(programId, owner, proofId);
}

export function derivePpvAgreementPda(
  partyA: PublicKey,
  agreementId: Uint8Array,
  programId = getPpvCommerceProgramId(),
) {
  return findAgreementAddress(programId, partyA, agreementId);
}

export type PreparedPpvTransaction = {
  connection: Connection;
  encodedTransaction: Uint8Array;
  blockhash: string;
  lastValidBlockHeight: number;
};

async function prepare(
  feePayer: PublicKey,
  instruction: TransactionInstruction,
): Promise<PreparedPpvTransaction> {
  const connection = getPpvConnection();
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    encodedTransaction: transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  };
}

export async function prepareCreateProofTransaction(input: {
  owner: string;
  proofIdHex: string;
  contentHashHex: string;
  contextHashHex: string;
  kind?: ProofKind;
}) {
  const programId = getPpvCoreProgramId();
  const owner = new PublicKey(input.owner);
  const proofId = hexToBytes(input.proofIdHex, 16);

  const instruction = await createProofInstruction({
    programId,
    authority: owner,
    proofId,
    contentHash: hexToBytes(input.contentHashHex, 32),
    contextHash: hexToBytes(input.contextHashHex, 32),
    kind: input.kind ?? "document",
  });

  return {
    ...(await prepare(owner, instruction)),
    proofPda: derivePpvProofPda(owner, proofId, programId).toBase58(),
  };
}

export async function prepareRevokeProofTransaction(input: {
  owner: string;
  proofPda: string;
}) {
  const owner = new PublicKey(input.owner);
  const instruction = await revokeProofInstruction({
    programId: getPpvCoreProgramId(),
    authority: owner,
    proof: new PublicKey(input.proofPda),
  });
  return prepare(owner, instruction);
}

export async function prepareCreateAgreementTransaction(input: {
  partyA: string;
  partyB: string;
  agreementIdHex: string;
  contentHashHex: string;
  termsHashHex: string;
  expiresAt: bigint;
}) {
  const programId = getPpvCommerceProgramId();
  const partyA = new PublicKey(input.partyA);
  const agreementId = hexToBytes(input.agreementIdHex, 16);

  const instruction = await createAgreementInstruction({
    programId,
    partyA,
    partyB: new PublicKey(input.partyB),
    agreementId,
    contentHash: hexToBytes(input.contentHashHex, 32),
    termsHash: hexToBytes(input.termsHashHex, 32),
    expiresAt: input.expiresAt,
  });

  return {
    ...(await prepare(partyA, instruction)),
    agreementPda: derivePpvAgreementPda(partyA, agreementId, programId).toBase58(),
  };
}

export async function prepareSignAgreementTransaction(input: {
  signer: string;
  agreementPda: string;
  expectedVersion: number;
  expectedContentHashHex: string;
  expectedTermsHashHex: string;
}) {
  const signer = new PublicKey(input.signer);
  const instruction = await signAgreementInstruction({
    programId: getPpvCommerceProgramId(),
    signer,
    agreement: new PublicKey(input.agreementPda),
    expectedVersion: input.expectedVersion,
    expectedContentHash: hexToBytes(input.expectedContentHashHex, 32),
    expectedTermsHash: hexToBytes(input.expectedTermsHashHex, 32),
  });
  return prepare(signer, instruction);
}

export async function prepareProposeRevisionTransaction(input: {
  signer: string;
  agreementPda: string;
  expectedVersion: number;
  newContentHashHex: string;
  newTermsHashHex: string;
}) {
  const signer = new PublicKey(input.signer);
  const instruction = await proposeRevisionInstruction({
    programId: getPpvCommerceProgramId(),
    signer,
    agreement: new PublicKey(input.agreementPda),
    expectedVersion: input.expectedVersion,
    newContentHash: hexToBytes(input.newContentHashHex, 32),
    newTermsHash: hexToBytes(input.newTermsHashHex, 32),
  });
  return prepare(signer, instruction);
}

export async function prepareCancelAgreementTransaction(input: {
  signer: string;
  agreementPda: string;
}) {
  const signer = new PublicKey(input.signer);
  const instruction = await cancelAgreementInstruction({
    programId: getPpvCommerceProgramId(),
    signer,
    agreement: new PublicKey(input.agreementPda),
  });
  return prepare(signer, instruction);
}
