import "server-only";

import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import { isPublicProofTheme, type PublicProofTheme } from "./social-proof-control";

export const PUBLIC_PROOF_EVENTS = [
  "proof_created",
  "theme_selected",
  "x_composer_opened",
  "proof_link_opened",
  "post_submitted",
  "verification_succeeded",
  "verification_failed",
  "receipt_viewed",
  "receipt_cta_clicked",
  "verification_revoked",
] as const;

export type PublicProofEvent = (typeof PUBLIC_PROOF_EVENTS)[number];

export function isPublicProofEvent(value: unknown): value is PublicProofEvent {
  return typeof value === "string" && (PUBLIC_PROOF_EVENTS as readonly string[]).includes(value);
}

function dayBucket(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function trackPublicProofEvent(input: {
  event: PublicProofEvent;
  challengeCode?: string | null;
  theme?: PublicProofTheme | null;
}) {
  const redis = getWorkspaceRedis();
  const day = dayBucket();
  const theme = input.theme && isPublicProofTheme(input.theme) ? input.theme : null;
  const keys = [
    getPrivateStorageKey("public-proof-analytics", `${day}:event:${input.event}`),
    ...(theme ? [getPrivateStorageKey("public-proof-analytics", `${day}:theme:${theme}:event:${input.event}`)] : []),
  ];

  await Promise.all(keys.map(async (key) => {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 90 * 24 * 60 * 60);
  }));

  // Deliberately do not persist IP addresses, post text, X handles, or browser fingerprints.
  // challengeCode is accepted for call-site correlation but is not written into analytics keys.
}
