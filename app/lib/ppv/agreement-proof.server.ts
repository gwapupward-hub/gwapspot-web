import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { prepareCoreOperation } from "./core-operation.server";
import { readCommerceAgreement } from "./commerce.server";

export class PpvAgreementProofRequestError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message = code) {
    super(message);
    this.name = "PpvAgreementProofRequestError";
    this.code = code;
    this.status = status;
  }
}

export async function prepareBoundAgreementProof(input: {
  authority: string;
  partyA: string;
  agreementIdHex: string;
}) {
  const agreement = await readCommerceAgreement({
    authority: input.authority,
    partyA: input.partyA,
    agreementIdHex: input.agreementIdHex,
  });

  if (agreement.partyA !== input.authority) {
    throw new PpvAgreementProofRequestError(
      "PARTY_A_REQUIRED",
      403,
      "The canonical agreement proof must be created by Party A.",
    );
  }
  if (agreement.state !== "executed") {
    throw new PpvAgreementProofRequestError(
      "AGREEMENT_NOT_EXECUTED",
      409,
      "The agreement must be fully executed before creating its bound Core proof.",
    );
  }

  const agreementKey = new PublicKey(agreement.agreementAddress);
  const contextHashHex = createHash("sha256")
    .update(Buffer.from(agreementKey.toBytes()))
    .digest("hex");
  const proofIdHex = randomBytes(16).toString("hex");

  const prepared = await prepareCoreOperation({
    action: "create",
    authority: input.authority,
    proofIdHex,
    contentHashHex: agreement.termsHash,
    contextHashHex,
    kind: "agreement",
  });

  return {
    ...prepared,
    binding: {
      schemaVersion: 1 as const,
      agreementAddress: agreement.agreementAddress,
      agreementIdHex: agreement.agreementId,
      agreementVersion: agreement.version,
      termsHashHex: agreement.termsHash,
      contextHashHex,
      proofKind: "agreement" as const,
    },
  };
}
