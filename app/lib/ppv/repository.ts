import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "../redis";
import type { PpvProofIndexRecord } from "../../app/lib/ppv/types";

const MAX_INDEXED_PROOFS = 100;

function key(owner: string) {
  return getPrivateStorageKey("ppv-proof-index-v1", owner);
}

export async function listIndexedProofs(owner: string) {
  return (await getWorkspaceRedis().get<PpvProofIndexRecord[]>(key(owner))) ?? [];
}

export async function indexProof(owner: string, proof: PpvProofIndexRecord) {
  const redis = getWorkspaceRedis();
  const current = (await redis.get<PpvProofIndexRecord[]>(key(owner))) ?? [];
  const next = [proof, ...current.filter((item) => item.proofId !== proof.proofId)].slice(0, MAX_INDEXED_PROOFS);
  await redis.set(key(owner), next);
  return next;
}
