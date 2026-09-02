import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PpvCredentialMetadataV1 } from "./ppv-reputation/eligibility.ts";

/**
 * A mint authorization is a short-lived, server-signed statement that a
 * specific holder may mint a credential for a specific receipt with exactly
 * this metadata. The minting service verifies it before touching a mint; a
 * browser cannot forge one because the secret never leaves the server.
 */

export const MINT_AUTHORIZATION_TTL_SECONDS = 15 * 60;

export type MintAuthorization = {
  version: 1;
  receiptId: string;
  holderWallet: string;
  metadataHash: string;
  expiresAt: string;
  signature: string;
};

export function hashCredentialMetadata(metadata: PpvCredentialMetadataV1): string {
  const canonical = JSON.stringify(metadata, Object.keys(metadata).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function payload(input: Omit<MintAuthorization, "signature" | "version">) {
  return `ppv-mint-authorization:v1|${input.receiptId}|${input.holderWallet}|${input.metadataHash}|${input.expiresAt}`;
}

export function signMintAuthorization(
  input: { receiptId: string; holderWallet: string; metadata: PpvCredentialMetadataV1 },
  secret: string,
  now = new Date(),
): MintAuthorization {
  if (!secret || secret.length < 32) throw new Error("PPV credential signing secret is not configured");
  const metadataHash = hashCredentialMetadata(input.metadata);
  const expiresAt = new Date(now.getTime() + MINT_AUTHORIZATION_TTL_SECONDS * 1_000).toISOString();
  const body = { receiptId: input.receiptId, holderWallet: input.holderWallet, metadataHash, expiresAt };
  const signature = createHmac("sha256", secret).update(payload(body)).digest("hex");
  return { version: 1, ...body, signature };
}

export function verifyMintAuthorization(
  authorization: MintAuthorization,
  expected: { receiptId: string; holderWallet: string; metadata: PpvCredentialMetadataV1 },
  secret: string,
  now = new Date(),
): boolean {
  if (!secret || secret.length < 32 || authorization.version !== 1) return false;
  if (authorization.receiptId !== expected.receiptId || authorization.holderWallet !== expected.holderWallet) return false;
  if (authorization.metadataHash !== hashCredentialMetadata(expected.metadata)) return false;
  if (Number.isNaN(Date.parse(authorization.expiresAt)) || Date.parse(authorization.expiresAt) <= now.getTime()) return false;
  const expectedSignature = createHmac("sha256", secret)
    .update(payload({ receiptId: authorization.receiptId, holderWallet: authorization.holderWallet, metadataHash: authorization.metadataHash, expiresAt: authorization.expiresAt }))
    .digest();
  if (!/^[0-9a-f]{64}$/.test(authorization.signature)) return false;
  return timingSafeEqual(Buffer.from(authorization.signature, "hex"), expectedSignature);
}
