import "server-only";

import { randomBytes } from "node:crypto";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import type { GeneratedDailyIdea } from "./daily-ideas-generator";

const HANDOFF_TTL_SECONDS = 24 * 60 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,96}$/;

type StoredHandoff = {
  idea: GeneratedDailyIdea;
  createdAt: string;
};

export async function createDailyIdeaHandoff(idea: GeneratedDailyIdea) {
  const token = randomBytes(32).toString("base64url");
  const key = getPrivateStorageKey("daily-ideas-handoff", token);
  await getWorkspaceRedis().set<StoredHandoff>(
    key,
    { idea, createdAt: new Date().toISOString() },
    { ex: HANDOFF_TTL_SECONDS },
  );
  return token;
}

export async function consumeDailyIdeaHandoff(token: unknown) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  const redis = getWorkspaceRedis();
  const key = getPrivateStorageKey("daily-ideas-handoff", token);
  const handoff = await redis.get<StoredHandoff>(key);
  if (!handoff?.idea) return null;

  await redis.del(key);
  return handoff.idea;
}
