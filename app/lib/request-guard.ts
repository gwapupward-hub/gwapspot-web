import { createHash } from "node:crypto";
import { checkDistributedRateLimit } from "./redis";

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  return checkDistributedRateLimit(key, limit, windowMs);
}

export function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function auditAuthEvent(
  event: string,
  userId: string,
  outcome: "success" | "rejected" | "failed",
) {
  const actor = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  console.info("gwap_auth_audit", { event, actor, outcome });
}
