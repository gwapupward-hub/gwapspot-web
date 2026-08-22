export type PpvProofIndexRecord = {
  proofId: string;
  proofPda: string;
  owner: string;
  contentHash: string;
  transactionSignature: string;
  cluster: "devnet" | "localnet";
  createdAt: string;
  revoked: boolean;
};

export type PpvVerificationResult = {
  verified: boolean;
  reason: "verified" | "hash_mismatch" | "revoked" | "not_found";
  proof?: {
    proofId: string;
    proofPda: string;
    owner: string;
    contentHash: string;
    createdAt: string;
    revoked: boolean;
  };
};
