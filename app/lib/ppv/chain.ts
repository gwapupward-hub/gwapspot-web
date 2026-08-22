import "server-only";

import { Buffer } from "node:buffer";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createHash } from "node:crypto";

const PROOF_ACCOUNT_DISCRIMINATOR = Buffer.from("ed3b9baccc75572c", "hex");

function cluster() {
  return process.env.NEXT_PUBLIC_PPV_CLUSTER === "localnet" ? "localnet" as const : "devnet" as const;
}

function rpcUrl() {
  const configured = process.env.NEXT_PUBLIC_PPV_RPC_URL?.trim();
  if (configured) return configured;
  return cluster() === "localnet" ? "http://127.0.0.1:8899" : clusterApiUrl("devnet");
}

export function getServerPpvProgramId() {
  const value = process.env.NEXT_PUBLIC_PPV_CORE_PROGRAM_ID?.trim();
  if (!value) throw new Error("PPV program is not configured");
  return new PublicKey(value);
}

export function parseProofId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw new Error("Invalid proof id");
  return Buffer.from(normalized, "hex");
}

export function parseContentHash(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error("Invalid content hash");
  return normalized;
}

export function deriveServerProofPda(proofId: Buffer, programId = getServerPpvProgramId()) {
  return PublicKey.findProgramAddressSync([Buffer.from("proof"), proofId], programId)[0];
}

export type OnChainProof = {
  proofId: string;
  proofPda: string;
  owner: string;
  ownerGns: string | null;
  contentHash: string;
  metadataHash: string;
  proofKind: number;
  createdAt: number;
  revoked: boolean;
  revokedAt: number;
};

function readI64(data: Buffer, offset: number) {
  return Number(data.readBigInt64LE(offset));
}

function decodeProofAccount(data: Buffer, proofPda: PublicKey): OnChainProof {
  if (data.length < 204 || !data.subarray(0, 8).equals(PROOF_ACCOUNT_DISCRIMINATOR)) {
    throw new Error("Account is not a PPV ProofRecord");
  }
  const version = data[9];
  if (version !== 1) throw new Error("Unsupported PPV proof schema");
  const owner = new PublicKey(data.subarray(26, 58));
  const ownerGns = new PublicKey(data.subarray(58, 90));
  return {
    proofId: data.subarray(10, 26).toString("hex"),
    proofPda: proofPda.toBase58(),
    owner: owner.toBase58(),
    ownerGns: ownerGns.equals(PublicKey.default) ? null : ownerGns.toBase58(),
    contentHash: data.subarray(90, 122).toString("hex"),
    metadataHash: data.subarray(122, 154).toString("hex"),
    proofKind: data[154],
    createdAt: readI64(data, 155),
    revoked: data[163] === 1,
    revokedAt: readI64(data, 164),
  };
}

export async function readPpvProof(proofIdHex: string) {
  const proofId = parseProofId(proofIdHex);
  const programId = getServerPpvProgramId();
  const proofPda = deriveServerProofPda(proofId, programId);
  const account = await new Connection(rpcUrl(), "confirmed").getAccountInfo(proofPda, "confirmed");
  if (!account || !account.owner.equals(programId)) return null;
  return decodeProofAccount(Buffer.from(account.data), proofPda);
}

export function getPpvCluster() {
  return cluster();
}

export function safeProofActor(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
