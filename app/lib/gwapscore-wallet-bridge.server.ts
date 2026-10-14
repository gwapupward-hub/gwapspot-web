import "server-only";

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  buildGwapScoreWalletEvidencePayload,
  collectWalletHistoryEvidence,
  type WalletHistoryEvidence,
} from "./gwapscore-wallet-evidence-core";

const GWAPSCORE_SYNC_TIMEOUT_MS = 8_000;

export class GwapScoreWalletBridgeError extends Error {
  constructor(
    public readonly code:
      | "GWAPSCORE_NOT_CONFIGURED"
      | "WALLET_HISTORY_UNAVAILABLE"
      | "WALLET_HISTORY_INCOMPLETE"
      | "GWAPSCORE_SYNC_FAILED",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GwapScoreWalletBridgeError";
  }
}

function mainnetRpcUrl() {
  return process.env.SOLANA_RPC_URL?.trim() || clusterApiUrl("mainnet-beta");
}

function getGwapScoreConfig() {
  const baseUrl = process.env.GWAPSCORE_API_URL?.trim();
  const apiKey = process.env.GWAPSCORE_ADAPTER_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new GwapScoreWalletBridgeError(
      "GWAPSCORE_NOT_CONFIGURED",
      503,
      "GwapScore wallet evidence sync is not configured.",
    );
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new GwapScoreWalletBridgeError(
      "GWAPSCORE_NOT_CONFIGURED",
      503,
      "GwapScore wallet evidence sync is not configured.",
    );
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && process.env.NODE_ENV !== "production")) {
    throw new GwapScoreWalletBridgeError(
      "GWAPSCORE_NOT_CONFIGURED",
      503,
      "GwapScore wallet evidence sync is not configured.",
    );
  }

  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    apiKey,
  };
}

export async function deriveVerifiedWalletHistoryEvidence(
  verifiedWallet: string,
): Promise<WalletHistoryEvidence> {
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(verifiedWallet);
  } catch {
    throw new GwapScoreWalletBridgeError(
      "WALLET_HISTORY_UNAVAILABLE",
      503,
      "Verified wallet history is temporarily unavailable.",
    );
  }

  const connection = new Connection(mainnetRpcUrl(), {
    commitment: "confirmed",
  });

  try {
    const evidence = await collectWalletHistoryEvidence(async ({ before, limit }) => {
      const page = await connection.getSignaturesForAddress(
        publicKey,
        { before, limit },
        "confirmed",
      );
      return page.map((entry) => ({
        signature: entry.signature,
        blockTime: entry.blockTime ?? null,
      }));
    });

    if (!evidence.evidenceCompleteForScoring) {
      throw new GwapScoreWalletBridgeError(
        "WALLET_HISTORY_INCOMPLETE",
        503,
        "Wallet history could not be established completely enough for reputation scoring.",
      );
    }

    return evidence;
  } catch (error) {
    if (error instanceof GwapScoreWalletBridgeError) throw error;
    throw new GwapScoreWalletBridgeError(
      "WALLET_HISTORY_UNAVAILABLE",
      503,
      "Verified wallet history is temporarily unavailable.",
    );
  }
}

export async function syncVerifiedWalletEvidenceToGwapScore(input: {
  subjectId: string;
  verifiedWallet: string;
}): Promise<WalletHistoryEvidence> {
  const evidence = await deriveVerifiedWalletHistoryEvidence(input.verifiedWallet);
  const config = getGwapScoreConfig();
  const payload = buildGwapScoreWalletEvidencePayload({
    subjectId: input.subjectId,
    verifiedWallet: input.verifiedWallet,
    evidence,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GWAPSCORE_SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/v1/adapters/solana/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GwapScoreWalletBridgeError(
        "GWAPSCORE_SYNC_FAILED",
        503,
        "GwapScore wallet evidence sync is temporarily unavailable.",
      );
    }

    return evidence;
  } catch (error) {
    if (error instanceof GwapScoreWalletBridgeError) throw error;
    throw new GwapScoreWalletBridgeError(
      "GWAPSCORE_SYNC_FAILED",
      503,
      "GwapScore wallet evidence sync is temporarily unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
