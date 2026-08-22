import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import { hexToBytes } from "./core";

const CREATE_PROOF_DISCRIMINATOR = Uint8Array.from([153, 56, 206, 152, 237, 25, 106, 154]);
const CONFIG_SEED = Buffer.from("config");
const PROOF_SEED = Buffer.from("proof");
const EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

export type PpvCluster = "devnet" | "localnet";

export function getPpvCluster(): PpvCluster {
  return process.env.NEXT_PUBLIC_PPV_CLUSTER === "localnet" ? "localnet" : "devnet";
}

export function getPpvRpcUrl() {
  const configured = process.env.NEXT_PUBLIC_PPV_RPC_URL?.trim();
  if (configured) return configured;
  return getPpvCluster() === "localnet" ? "http://127.0.0.1:8899" : clusterApiUrl("devnet");
}

export function getPpvConnection() {
  return new Connection(getPpvRpcUrl(), "confirmed");
}

export function getPpvCoreProgramId() {
  const value = process.env.NEXT_PUBLIC_PPV_CORE_PROGRAM_ID?.trim();
  if (!value) throw new Error("PPV devnet program is not configured yet.");
  try {
    return new PublicKey(value);
  } catch {
    throw new Error("PPV devnet program ID is invalid.");
  }
}

export function derivePpvConfigPda(programId = getPpvCoreProgramId()) {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

export function derivePpvProofPda(proofId: Uint8Array, programId = getPpvCoreProgramId()) {
  if (proofId.length !== 16) throw new Error("Proof ID must be 16 bytes");
  return PublicKey.findProgramAddressSync([PROOF_SEED, Buffer.from(proofId)], programId)[0];
}

export function deriveEventAuthorityPda(programId = getPpvCoreProgramId()) {
  return PublicKey.findProgramAddressSync([EVENT_AUTHORITY_SEED], programId)[0];
}

export async function prepareCreateProofTransaction(input: {
  owner: string;
  proofIdHex: string;
  contentHashHex: string;
  metadataHashHex: string;
  proofKind?: number;
}) {
  const programId = getPpvCoreProgramId();
  const owner = new PublicKey(input.owner);
  const proofId = hexToBytes(input.proofIdHex, 16);
  const contentHash = hexToBytes(input.contentHashHex, 32);
  const metadataHash = hexToBytes(input.metadataHashHex, 32);
  const proofKind = input.proofKind ?? 1;
  if (!Number.isInteger(proofKind) || proofKind < 0 || proofKind > 8) {
    throw new Error("Unsupported PPV proof kind");
  }

  const config = derivePpvConfigPda(programId);
  const proof = derivePpvProofPda(proofId, programId);
  const eventAuthority = deriveEventAuthorityPda(programId);
  const data = Buffer.concat([
    Buffer.from(CREATE_PROOF_DISCRIMINATOR),
    Buffer.from(proofId),
    Buffer.from(contentHash),
    Buffer.from(metadataHash),
    Buffer.from(PublicKey.default.toBytes()),
    Buffer.from([proofKind]),
  ]);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: proof, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const connection = getPpvConnection();
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: owner,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    encodedTransaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
    proofPda: proof.toBase58(),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  };
}
