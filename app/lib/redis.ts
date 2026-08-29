import "server-only";

import { createHash } from "node:crypto";
import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";
import { getWorkspaceStorageCredentials } from "./auth-config";

const STORAGE_NAMESPACE = "gwap:sprint5:v1";
const DIRECT_REDIS_CONNECT_TIMEOUT_MS = 5_000;

type SetOptions = { ex?: number };

const DELETE_IF_VALUE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export type WorkspaceRedis = {
  deleteIfValue(key: string, value: string): Promise<boolean>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get<T>(key: string): Promise<T | null>;
  incr(key: string): Promise<number>;
  ping(): Promise<boolean>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<void>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
};

class RestWorkspaceRedis implements WorkspaceRedis {
  constructor(private readonly client: UpstashRedis) {}

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

function getSafeRedisErrorDetails(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code).slice(0, 40)
      : undefined;

  return {
    provider: "redis-url",
    name: error instanceof Error ? error.name : "Error",
    ...(code ? { code } : {}),
  };
}

class DirectWorkspaceRedis implements WorkspaceRedis {
  private client: DirectRedisClient | null = null;
  private connection: Promise<DirectRedisClient> | null = null;

  constructor(private readonly url: string) {}

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
        console.error("gwap_redis_error", getSafeRedisErrorDetails(error));
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

let redisClient: WorkspaceRedis | null = null;

export function getWorkspaceRedis() {
  if (redisClient) return redisClient;

  const storage = getWorkspaceStorageCredentials();
  if (!storage) throw new Error("Workspace storage is not configured");

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
