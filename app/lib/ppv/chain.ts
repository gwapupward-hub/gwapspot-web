import "server-only";

import { Buffer } from "node:buffer";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  decodeAgreementAccount,
  decodeProofAccount,
  deriveServerAgreementPda,
  deriveServerProofPda,
  parseProofId,
  parseWallet,
} from "./chain-decode";

/**
 * Server-side reader for PPV account state. Chain is the source of truth; the
 * Redis index is only a cache, so every write path re-reads the account here
 * before trusting anything a client sent.
 *
 * The layouts live in `chain-decode.ts`, which is free of `server-only` and can
 * therefore be exercised directly against real accounts by the integration
 * harness. This module is only RPC and configuration.
 */

export {
  deriveServerAgreementPda,
  deriveServerProofPda,
  parseContentHash,
  parseProofId,
  parseWallet,
  safeProofActor,
  type OnChainAgreement,
  type OnChainProof,
  type OnChainSignature,
} from "./chain-decode";

export const PPV_CLUSTER = "devnet" as const;

export function getPpvCluster() {
  return PPV_CLUSTER;
}

function rpcUrl() {
  // Deliberately PPV-scoped. The app-wide SOLANA_RPC_URL points at mainnet for
  // Wallet Intelligence, and PPV Foundation must never read or write there.
  // Server reads prefer the server-only endpoint, which may carry a provider
  // credential; the browser-visible devnet value is the fallback.
  const serverOnly = process.env.PPV_SOLANA_RPC_URL?.trim();
  if (serverOnly) return serverOnly;
  const published = process.env.NEXT_PUBLIC_PPV_RPC_URL?.trim();
  return published || clusterApiUrl(PPV_CLUSTER);
}

export function getServerPpvProgramId() {
  const value = process.env.NEXT_PUBLIC_PPV_CORE_PROGRAM_ID?.trim();
  if (!value) throw new Error("PPV core program is not configured");
  return new PublicKey(value);
}

export function getServerPpvCommerceProgramId() {
  const value = process.env.NEXT_PUBLIC_PPV_COMMERCE_PROGRAM_ID?.trim();
  if (!value) throw new Error("PPV commerce program is not configured");
  return new PublicKey(value);
}

export async function readPpvProof(ownerBase58: string, proofIdHex: string) {
  const owner = parseWallet(ownerBase58);
  const proofId = parseProofId(proofIdHex);
  const programId = getServerPpvProgramId();
  const proofPda = deriveServerProofPda(owner, proofId, programId);

  const account = await new Connection(rpcUrl(), "confirmed").getAccountInfo(
    proofPda,
    "confirmed",
  );
  if (!account || !account.owner.equals(programId)) return null;
  return decodeProofAccount(Buffer.from(account.data), proofPda);
}

export async function readPpvAgreement(
  partyABase58: string,
  agreementIdHex: string,
) {
  const partyA = parseWallet(partyABase58);
  const agreementId = parseProofId(agreementIdHex);
  const programId = getServerPpvCommerceProgramId();
  const agreementPda = deriveServerAgreementPda(partyA, agreementId, programId);

  const account = await new Connection(rpcUrl(), "confirmed").getAccountInfo(
    agreementPda,
    "confirmed",
  );
  if (!account || !account.owner.equals(programId)) return null;
  return decodeAgreementAccount(Buffer.from(account.data), agreementPda);
}
