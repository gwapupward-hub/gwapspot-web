import "server-only";

import { createHash } from "node:crypto";
import { Redis as UpstashRedis } from "@upstash/redis";
import { Pool } from "pg";
import { createClient } from "redis";
import { getWorkspaceStorageCredentials } from "./auth-config";

const STORAGE_NAMESPACE = "gwap:sprint5:v1";
const DIRECT_REDIS_CONNECT_TIMEOUT_MS = 5_000;
const POSTGRES_CONNECT_TIMEOUT_MS = 5_000;
const POSTGRES_IDLE_TIMEOUT_MS = 5_000;
const POSTGRES_EXPIRED_CLEANUP_INTERVAL_MS = 60_000;
const POSTGRES_TABLE = "gwap_workspace_kv_v1";

type SetOptions = { ex?: number };

/**
 * Compatibility storage contract used throughout GwapOS. The historical name
 * is retained so the Neon pilot can replace the backend without a risky,
 * repo-wide call-site rewrite.
 */
export type WorkspaceRedis = {
  deleteIfValue(key: string, value: string): Promise<boolean>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get<T>(key: string): Promise<T | null>;
  incr(key: string): Promise<number>;
  ping(): Promise<boolean>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<void>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Persistent NX write for immutable records; returns false when the key already exists. */
  setIfAbsentValue<T>(key: string, value: T): Promise<boolean>;
};

const DELETE_IF_VALUE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

class RestWorkspaceRedis implements WorkspaceRedis {
  private readonly client: UpstashRedis;
  constructor(client: UpstashRedis) {
    this.client = client;
  }

  async get<T>(key: string) {
    return this.client.get<T>(key);
  }

  async set<T>(key: string, value: T, options?: SetOptions) {
    if (options?.ex) {
      await this.client.set(key, value, { ex: options.ex });
      return;
    }
    await this.client.set(key, value);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    const result = await this.client.set(key, value, {
      ex: ttlSeconds,
      nx: true,
    });
    return result === "OK";
  }

  async setIfAbsentValue<T>(key: string, value: T) {
    const result = await this.client.set(key, value, { nx: true });
    return result === "OK";
  }

  async deleteIfValue(key: string, value: string) {
    const result = await this.client.eval<[string], number>(
      DELETE_IF_VALUE_SCRIPT,
      [key],
      [value],
    );
    return Number(result) > 0;
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async incr(key: string) {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number) {
    return this.client.expire(key, seconds);
  }

  async ping() {
    return (await this.client.ping()) === "PONG";
  }
}

type DirectRedisClient = ReturnType<typeof createClient>;

function getSafeStorageErrorDetails(provider: "redis-url" | "postgres", error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code).slice(0, 40)
      : undefined;

  return {
    provider,
    name: error instanceof Error ? error.name : "Error",
    ...(code ? { code } : {}),
  };
}

class DirectWorkspaceRedis implements WorkspaceRedis {
  private client: DirectRedisClient | null = null;
  private connection: Promise<DirectRedisClient> | null = null;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  private getClient() {
    if (this.client?.isReady) return Promise.resolve(this.client);

    if (!this.client) {
      this.client = createClient({
        url: this.url,
        disableOfflineQueue: true,
        socket: {
          connectTimeout: DIRECT_REDIS_CONNECT_TIMEOUT_MS,
          reconnectStrategy: (retries) =>
            retries >= 2 ? false : Math.min(100 * 2 ** retries, 500),
        },
      });
      this.client.on("error", (error: unknown) => {
        console.error("gwap_workspace_storage_error", getSafeStorageErrorDetails("redis-url", error));
      });
    }

    if (!this.connection) {
      const client = this.client;
      this.connection = client
        .connect()
        .then(() => client)
        .catch((error: unknown) => {
          this.connection = null;
          if (client.isOpen) client.destroy();
          if (this.client === client) this.client = null;
          throw error;
        });
    }

    return this.connection;
  }

  async get<T>(key: string) {
    const value = await (await this.getClient()).sendCommand(["GET", key]);
    if (value === null) return null;

    try {
      return JSON.parse(String(value)) as T;
    } catch {
      return String(value) as T;
    }
  }

  async set<T>(key: string, value: T, options?: SetOptions) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Workspace storage value is not serializable");
    }

    const command = ["SET", key, serialized];
    if (options?.ex) command.push("EX", String(options.ex));
    const result = await (await this.getClient()).sendCommand(command);
    if (String(result) !== "OK") {
      throw new Error("Workspace storage write failed");
    }
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    const result = await (await this.getClient()).sendCommand([
      "SET",
      key,
      value,
      "EX",
      String(ttlSeconds),
      "NX",
    ]);
    return String(result) === "OK";
  }

  async setIfAbsentValue<T>(key: string, value: T) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Workspace storage value is not serializable");
    }
    const result = await (await this.getClient()).sendCommand(["SET", key, serialized, "NX"]);
    return String(result) === "OK";
  }

  async deleteIfValue(key: string, value: string) {
    const result = await (await this.getClient()).sendCommand([
      "EVAL",
      DELETE_IF_VALUE_SCRIPT,
      "1",
      key,
      value,
    ]);
    return Number(result) > 0;
  }

  async del(key: string) {
    const result = await (await this.getClient()).sendCommand(["DEL", key]);
    return Number(result);
  }

  async incr(key: string) {
    const result = await (await this.getClient()).sendCommand(["INCR", key]);
    return Number(result);
  }

  async expire(key: string, seconds: number) {
    const result = await (await this.getClient()).sendCommand([
      "EXPIRE",
      key,
      String(seconds),
    ]);
    return Number(result);
  }

  async ping() {
    const result = await (await this.getClient()).sendCommand(["PING"]);
    return String(result) === "PONG";
  }
}

class PostgresWorkspaceRedis implements WorkspaceRedis {
  private readonly pool: Pool;
  private schemaReady: Promise<void> | null = null;
  private lastExpiredCleanupAt = 0;

  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      // Keep the pilot conservative on serverless instances. Neon supplies a
      // pooled application URL, so PgBouncer handles fan-out above this layer.
      max: 2,
      connectionTimeoutMillis: POSTGRES_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: POSTGRES_IDLE_TIMEOUT_MS,
      allowExitOnIdle: true,
    });

    this.pool.on("error", (error: unknown) => {
      console.error(
        "gwap_workspace_storage_error",
        getSafeStorageErrorDetails("postgres", error),
      );
    });
  }

  private ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS ${POSTGRES_TABLE} (
            storage_key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            expires_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS ${POSTGRES_TABLE}_expires_at_idx
          ON ${POSTGRES_TABLE} (expires_at)
          WHERE expires_at IS NOT NULL
        `);
      })().catch((error: unknown) => {
        this.schemaReady = null;
        throw error;
      });
    }
    return this.schemaReady;
  }

  private async ready() {
    await this.ensureSchema();
  }

  private async cleanupExpiredRows() {
    const now = Date.now();
    if (now - this.lastExpiredCleanupAt < POSTGRES_EXPIRED_CLEANUP_INTERVAL_MS) return;
    this.lastExpiredCleanupAt = now;

    try {
      await this.pool.query(
        `DELETE FROM ${POSTGRES_TABLE} WHERE expires_at IS NOT NULL AND expires_at <= NOW()`,
      );
    } catch {
      // Expiry is enforced in every read/write query. Cleanup is only physical
      // reclamation and must never turn a successful request into a 5xx.
    }
  }

  async get<T>(key: string) {
    await this.ready();
    const result = await this.pool.query<{ value: T }>(
      `
        SELECT value
        FROM ${POSTGRES_TABLE}
        WHERE storage_key = $1
          AND (expires_at IS NULL OR expires_at > NOW())
      `,
      [key],
    );
    return result.rows[0]?.value ?? null;
  }

  async set<T>(key: string, value: T, options?: SetOptions) {
    await this.ready();
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Workspace storage value is not serializable");
    }

    await this.pool.query(
      `
        INSERT INTO ${POSTGRES_TABLE} (storage_key, value, expires_at, updated_at)
        VALUES (
          $1,
          $2::jsonb,
          CASE
            WHEN $3::integer IS NULL THEN NULL
            ELSE NOW() + ($3::integer * INTERVAL '1 second')
          END,
          NOW()
        )
        ON CONFLICT (storage_key) DO UPDATE
        SET value = EXCLUDED.value,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
      `,
      [key, serialized, options?.ex ?? null],
    );
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    await this.ready();
    const result = await this.pool.query(
      `
        INSERT INTO ${POSTGRES_TABLE} (storage_key, value, expires_at, updated_at)
        VALUES (
          $1,
          $2::jsonb,
          NOW() + ($3::integer * INTERVAL '1 second'),
          NOW()
        )
        ON CONFLICT (storage_key) DO UPDATE
        SET value = EXCLUDED.value,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
        WHERE ${POSTGRES_TABLE}.expires_at IS NOT NULL
          AND ${POSTGRES_TABLE}.expires_at <= NOW()
        RETURNING storage_key
      `,
      [key, JSON.stringify(value), Math.max(1, Math.floor(ttlSeconds))],
    );
    return result.rowCount === 1;
  }

  async setIfAbsentValue<T>(key: string, value: T) {
    await this.ready();
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Workspace storage value is not serializable");
    }

    const result = await this.pool.query(
      `
        INSERT INTO ${POSTGRES_TABLE} (storage_key, value, expires_at, updated_at)
        VALUES ($1, $2::jsonb, NULL, NOW())
        ON CONFLICT (storage_key) DO UPDATE
        SET value = EXCLUDED.value,
            expires_at = NULL,
            updated_at = NOW()
        WHERE ${POSTGRES_TABLE}.expires_at IS NOT NULL
          AND ${POSTGRES_TABLE}.expires_at <= NOW()
        RETURNING storage_key
      `,
      [key, serialized],
    );
    return result.rowCount === 1;
  }

  async deleteIfValue(key: string, value: string) {
    await this.ready();
    const result = await this.pool.query(
      `
        DELETE FROM ${POSTGRES_TABLE}
        WHERE storage_key = $1
          AND (expires_at IS NULL OR expires_at > NOW())
          AND value = $2::jsonb
      `,
      [key, JSON.stringify(value)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async del(key: string) {
    await this.ready();
    const result = await this.pool.query(
      `DELETE FROM ${POSTGRES_TABLE} WHERE storage_key = $1`,
      [key],
    );
    return result.rowCount ?? 0;
  }

  async incr(key: string) {
    await this.ready();
    const result = await this.pool.query<{ count: string }>(
      `
        INSERT INTO ${POSTGRES_TABLE} (storage_key, value, expires_at, updated_at)
        VALUES ($1, '1'::jsonb, NULL, NOW())
        ON CONFLICT (storage_key) DO UPDATE
        SET value = CASE
              WHEN ${POSTGRES_TABLE}.expires_at IS NOT NULL
                AND ${POSTGRES_TABLE}.expires_at <= NOW()
                THEN '1'::jsonb
              ELSE to_jsonb(((${POSTGRES_TABLE}.value #>> '{}')::bigint) + 1)
            END,
            expires_at = CASE
              WHEN ${POSTGRES_TABLE}.expires_at IS NOT NULL
                AND ${POSTGRES_TABLE}.expires_at <= NOW()
                THEN NULL
              ELSE ${POSTGRES_TABLE}.expires_at
            END,
            updated_at = NOW()
        WHERE (
          ${POSTGRES_TABLE}.expires_at IS NOT NULL
          AND ${POSTGRES_TABLE}.expires_at <= NOW()
        ) OR (
          jsonb_typeof(${POSTGRES_TABLE}.value) = 'number'
          AND (${POSTGRES_TABLE}.value #>> '{}') ~ '^-?[0-9]+$'
        )
        RETURNING (value #>> '{}')::bigint AS count
      `,
      [key],
    );

    const count = result.rows[0]?.count;
    if (count === undefined) {
      throw new Error("Workspace storage counter contains a non-integer value");
    }

    void this.cleanupExpiredRows();
    return Number(count);
  }

  async expire(key: string, seconds: number) {
    await this.ready();
    const result = await this.pool.query(
      `
        UPDATE ${POSTGRES_TABLE}
        SET expires_at = NOW() + ($2::integer * INTERVAL '1 second'),
            updated_at = NOW()
        WHERE storage_key = $1
          AND (expires_at IS NULL OR expires_at > NOW())
      `,
      [key, Math.max(1, Math.floor(seconds))],
    );
    return result.rowCount ?? 0;
  }

  async ping() {
    await this.ready();
    await this.pool.query("SELECT 1");
    void this.cleanupExpiredRows();
    return true;
  }
}

let redisClient: WorkspaceRedis | null = null;

export function getWorkspaceRedis() {
  if (redisClient) return redisClient;

  const storage = getWorkspaceStorageCredentials();
  if (!storage) throw new Error("Workspace storage is not configured");

  if (storage.kind === "postgres") {
    redisClient = new PostgresWorkspaceRedis(storage.url);
    return redisClient;
  }

  redisClient =
    storage.kind === "direct"
      ? new DirectWorkspaceRedis(storage.url)
      : new RestWorkspaceRedis(
          new UpstashRedis({ url: storage.url, token: storage.token }),
        );
  return redisClient;
}

export function getPrivateStorageKey(scope: string, subject: string) {
  const digest = createHash("sha256").update(subject).digest("hex");
  return `${STORAGE_NAMESPACE}:${scope}:${digest}`;
}

export async function checkDistributedRateLimit(
  subject: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const key = getPrivateStorageKey("rate", `${subject}:${window}`);
  const redis = getWorkspaceRedis();
  const count = await redis.incr(key);

  // INCR creates the key without a TTL, so the first caller in a window sets
  // one. A failure here must not reject the request: the counter itself
  // already succeeded, and keys are window-scoped, so the worst case is that
  // this one window's key is retained rather than expired. Letting the error
  // propagate would turn a storage hiccup into a 503 for a caller that is
  // comfortably within its limit.
  if (count === 1) {
    try {
      await redis.expire(key, Math.max(2, Math.ceil(windowMs / 1_000) + 1));
    } catch {
      // Retained key, not a failed request.
    }
  }

  const retryAfter = Math.max(
    1,
    Math.ceil(((window + 1) * windowMs - now) / 1_000),
  );

  return { allowed: count <= limit, retryAfter: count <= limit ? 0 : retryAfter };
}
