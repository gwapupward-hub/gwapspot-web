import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getWalletAuthConfigurationStatus,
  getWorkspaceStorageConfigurationStatus,
  getWorkspaceStorageCredentials,
} from "./auth-config.ts";

const environmentKeys = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "REDIS_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
];
const originalEnvironment = new Map(
  environmentKeys.map((key) => [key, process.env[key]]),
);

function clearStorageEnvironment() {
  for (const key of environmentKeys) delete process.env[key];
}

afterEach(() => {
  clearStorageEnvironment();
  for (const [key, value] of originalEnvironment) {
    if (value !== undefined) process.env[key] = value;
  }
});

test("an explicit direct Redis URL overrides auto-provisioned REST credentials", () => {
  clearStorageEnvironment();
  process.env.REDIS_URL = "rediss://user:password@redis.example.com:6380";
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

  assert.deepEqual(getWorkspaceStorageConfigurationStatus(), {
    configured: true,
    source: "redis-url",
    urlConfigured: true,
    tokenConfigured: true,
  });
  assert.deepEqual(getWorkspaceStorageCredentials(), {
    kind: "direct",
    source: "redis-url",
    url: "rediss://user:password@redis.example.com:6380",
  });
});

test("an invalid direct URL does not shadow complete Upstash credentials", () => {
  clearStorageEnvironment();
  process.env.REDIS_URL = "https://not-a-redis-endpoint.example.com";
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

  assert.equal(getWorkspaceStorageConfigurationStatus().source, "upstash");
  assert.deepEqual(getWorkspaceStorageCredentials(), {
    kind: "rest",
    source: "upstash",
    url: "https://upstash.example.com",
    token: "upstash-token",
  });
});

test("wallet authentication is ready with Privy and direct Redis", () => {
  clearStorageEnvironment();
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy-app";
  process.env.PRIVY_APP_SECRET = "privy-secret";
  process.env.REDIS_URL = "redis://user:password@redis.example.com:6379";

  assert.deepEqual(getWalletAuthConfigurationStatus(), {
    configured: true,
    authenticationConfigured: true,
    storageConfigured: true,
    storageSource: "redis-url",
    storageUrlConfigured: true,
    storageTokenConfigured: true,
    reason: "ready",
  });
});
