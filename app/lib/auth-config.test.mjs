import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getWalletAuthConfigurationStatus,
  getWorkspaceStorageConfigurationStatus,
  getWorkspaceStorageCredentials,
} from "./auth-config.ts";

const environmentKeys = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "REDIS_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "WORKSPACE_STORAGE_BACKEND",
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

test("a quoted direct Redis URL is normalized before provider selection", () => {
  clearStorageEnvironment();
  process.env.REDIS_URL = '"rediss://user:password@redis.example.com:6380"';
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

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


test("postgres storage requires an explicit backend switch", () => {
  clearStorageEnvironment();
  process.env.DATABASE_URL =
    "postgresql://gwap:secret@ep-example-pooler.us-east-2.aws.neon.tech/gwapspot";

  assert.deepEqual(getWorkspaceStorageConfigurationStatus(), {
    configured: false,
    source: "none",
    urlConfigured: false,
    tokenConfigured: false,
  });
  assert.equal(getWorkspaceStorageCredentials(), null);
});

test("postgres storage wins only when explicitly selected", () => {
  clearStorageEnvironment();
  process.env.WORKSPACE_STORAGE_BACKEND = "postgres";
  process.env.DATABASE_URL =
    "postgresql://gwap:secret@ep-example-pooler.us-east-2.aws.neon.tech/gwapspot";
  process.env.REDIS_URL = "redis://user:password@redis.example.com:6379";

  assert.deepEqual(getWorkspaceStorageConfigurationStatus(), {
    configured: true,
    source: "postgres",
    urlConfigured: true,
    tokenConfigured: true,
  });
  assert.deepEqual(getWorkspaceStorageCredentials(), {
    kind: "postgres",
    source: "postgres",
    url: "postgresql://gwap:secret@ep-example-pooler.us-east-2.aws.neon.tech/gwapspot",
  });
});

test("legacy postgres ssl modes are normalized to verify-full", () => {
  clearStorageEnvironment();
  process.env.WORKSPACE_STORAGE_BACKEND = "postgres";
  process.env.DATABASE_URL =
    "postgresql://gwap:secret@ep-example-pooler.us-east-2.aws.neon.tech/gwapspot?sslmode=require";

  const credentials = getWorkspaceStorageCredentials();
  assert.equal(credentials?.kind, "postgres");
  assert.equal(
    credentials?.url,
    "postgresql://gwap:secret@ep-example-pooler.us-east-2.aws.neon.tech/gwapspot?sslmode=verify-full",
  );
});

test("explicit postgres verify-full is preserved", () => {
  clearStorageEnvironment();
  process.env.WORKSPACE_STORAGE_BACKEND = "postgres";
  process.env.DATABASE_URL =
    "postgresql://gwap:secret@ep-example-pooler.us-east-2.aws.neon.tech/gwapspot?sslmode=verify-full";

  assert.equal(
    getWorkspaceStorageCredentials()?.url,
    process.env.DATABASE_URL,
  );
});

test("wallet authentication is ready with Privy and explicit postgres storage", () => {
  clearStorageEnvironment();
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy-app";
  process.env.PRIVY_APP_SECRET = "privy-secret";
  process.env.WORKSPACE_STORAGE_BACKEND = "postgres";
  process.env.DATABASE_URL =
    "postgresql://gwap:secret@ep-example-pooler.us-east-2.aws.neon.tech/gwapspot";

  assert.deepEqual(getWalletAuthConfigurationStatus(), {
    configured: true,
    authenticationConfigured: true,
    storageConfigured: true,
    storageSource: "postgres",
    storageUrlConfigured: true,
    storageTokenConfigured: true,
    reason: "ready",
  });
});

test("invalid postgres configuration fails closed instead of falling back to Redis", () => {
  clearStorageEnvironment();
  process.env.WORKSPACE_STORAGE_BACKEND = "postgres";
  process.env.DATABASE_URL = "https://not-postgres.example.com";
  process.env.REDIS_URL = "redis://user:password@redis.example.com:6379";

  assert.deepEqual(getWorkspaceStorageConfigurationStatus(), {
    configured: false,
    source: "postgres",
    urlConfigured: true,
    tokenConfigured: false,
  });
  assert.equal(getWorkspaceStorageCredentials(), null);
});
