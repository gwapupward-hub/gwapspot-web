import { createHash } from "node:crypto";

// Mirrors getPrivateStorageKey() in redis.ts so workspace data lives in the
// same private, hashed keyspace as the rest of GwapOS. Kept dependency-free so
// the workspace logic modules stay unit-testable without the server-only Redis
// singleton.
const STORAGE_NAMESPACE = "gwap:sprint5:v1";

export function workspaceStorageKey(scope: string, subject: string) {
  const digest = createHash("sha256").update(subject).digest("hex");
  return `${STORAGE_NAMESPACE}:${scope}:${digest}`;
}
