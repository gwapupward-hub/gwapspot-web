export type WorkspaceStorageSource =
  | "postgres"
  | "upstash"
  | "vercel-kv"
  | "redis-url"
  | "none";

export type WorkspaceStorageConfigurationStatus = {
  configured: boolean;
  source: WorkspaceStorageSource;
  urlConfigured: boolean;
  tokenConfigured: boolean;
};

export type WorkspaceStorageCredentials =
  | {
      kind: "postgres";
      source: "postgres";
      url: string;
    }
  | {
      kind: "rest";
      source: "upstash" | "vercel-kv";
      url: string;
      token: string;
    }
  | {
      kind: "direct";
      source: "redis-url";
      url: string;
    };

export type WalletAuthConfigurationStatus = {
  configured: boolean;
  authenticationConfigured: boolean;
  storageConfigured: boolean;
  storageSource: WorkspaceStorageSource;
  storageUrlConfigured: boolean;
  storageTokenConfigured: boolean;
  reason:
    | "ready"
    | "missing_privy_configuration"
    | "missing_workspace_storage";
};

function normalizeValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeQuotedValue(value: string | undefined) {
  const rawValue = normalizeValue(value);
  if (!rawValue) return null;

  const firstCharacter = rawValue[0];
  return (firstCharacter === '"' || firstCharacter === "'") &&
    rawValue.at(-1) === firstCharacter
    ? rawValue.slice(1, -1).trim()
    : rawValue;
}

function normalizeDirectRedisUrl(value: string | undefined) {
  const normalized = normalizeQuotedValue(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (!url.hostname || (url.protocol !== "redis:" && url.protocol !== "rediss:")) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function normalizePostgresUrl(value: string | undefined) {
  const normalized = normalizeQuotedValue(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (
      !url.hostname ||
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    ) {
      return null;
    }

    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      // pg currently treats these modes as aliases for verify-full, but pg v9
      // will adopt libpq semantics. Make the existing certificate-verification
      // behavior explicit now so the upgrade cannot silently weaken TLS checks.
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }

    return normalized;
  } catch {
    return null;
  }
}

function requestedWorkspaceStorageBackend() {
  const value = normalizeValue(process.env.WORKSPACE_STORAGE_BACKEND)?.toLowerCase();
  if (!value) return null;
  if (value === "postgres" || value === "redis") return value;
  return "invalid" as const;
}

function getWorkspaceStorageCandidates() {
  return [
    {
      source: "upstash" as const,
      url: normalizeValue(process.env.UPSTASH_REDIS_REST_URL),
      token: normalizeValue(process.env.UPSTASH_REDIS_REST_TOKEN),
    },
    {
      source: "vercel-kv" as const,
      url: normalizeValue(process.env.KV_REST_API_URL),
      token: normalizeValue(process.env.KV_REST_API_TOKEN),
    },
  ];
}

export function getWorkspaceStorageConfigurationStatus(): WorkspaceStorageConfigurationStatus {
  const requestedBackend = requestedWorkspaceStorageBackend();

  if (requestedBackend === "postgres") {
    const rawValue = normalizeValue(process.env.DATABASE_URL);
    const postgresUrl = normalizePostgresUrl(process.env.DATABASE_URL);
    return {
      configured: Boolean(postgresUrl),
      source: "postgres",
      urlConfigured: Boolean(rawValue),
      // Postgres credentials are carried by the connection URL rather than a
      // separate token. Keep this legacy field true when the URL is valid so
      // existing health consumers continue to treat storage as complete.
      tokenConfigured: Boolean(postgresUrl),
    };
  }

  if (requestedBackend === "invalid") {
    return {
      configured: false,
      source: "none",
      urlConfigured: false,
      tokenConfigured: false,
    };
  }

  const directValue = normalizeValue(process.env.REDIS_URL);
  const directUrl = normalizeDirectRedisUrl(process.env.REDIS_URL);
  if (directUrl) {
    return {
      configured: true,
      source: "redis-url",
      urlConfigured: true,
      tokenConfigured: true,
    };
  }

  const candidates = getWorkspaceStorageCandidates();
  const complete = candidates.find((candidate) => candidate.url && candidate.token);

  if (complete) {
    return {
      configured: true,
      source: complete.source,
      urlConfigured: true,
      tokenConfigured: true,
    };
  }

  const partial = candidates.find((candidate) => candidate.url || candidate.token);
  if (!partial && directValue) {
    return {
      configured: false,
      source: "redis-url",
      urlConfigured: true,
      tokenConfigured: false,
    };
  }

  return {
    configured: false,
    source: partial?.source ?? "none",
    urlConfigured: Boolean(partial?.url),
    tokenConfigured: Boolean(partial?.token),
  };
}

export function getWorkspaceStorageCredentials(): WorkspaceStorageCredentials | null {
  const requestedBackend = requestedWorkspaceStorageBackend();

  if (requestedBackend === "postgres") {
    const postgresUrl = normalizePostgresUrl(process.env.DATABASE_URL);
    return postgresUrl
      ? { kind: "postgres", source: "postgres", url: postgresUrl }
      : null;
  }

  if (requestedBackend === "invalid") return null;

  const directUrl = normalizeDirectRedisUrl(process.env.REDIS_URL);
  if (directUrl) {
    return { kind: "direct", source: "redis-url", url: directUrl };
  }

  const complete = getWorkspaceStorageCandidates().find(
    (candidate) => candidate.url && candidate.token,
  );

  if (complete?.url && complete.token) {
    return {
      kind: "rest",
      source: complete.source,
      url: complete.url,
      token: complete.token,
    };
  }

  return null;
}

export function getWalletAuthConfigurationStatus(): WalletAuthConfigurationStatus {
  const authenticationConfigured =
    Boolean(normalizeValue(process.env.NEXT_PUBLIC_PRIVY_APP_ID)) &&
    Boolean(normalizeValue(process.env.PRIVY_APP_SECRET));
  const storage = getWorkspaceStorageConfigurationStatus();

  const baseStatus = {
    authenticationConfigured,
    storageConfigured: storage.configured,
    storageSource: storage.source,
    storageUrlConfigured: storage.urlConfigured,
    storageTokenConfigured: storage.tokenConfigured,
  };

  if (!authenticationConfigured) {
    return {
      ...baseStatus,
      configured: false,
      reason: "missing_privy_configuration",
    };
  }

  if (!storage.configured) {
    return {
      ...baseStatus,
      configured: false,
      reason: "missing_workspace_storage",
    };
  }

  return {
    ...baseStatus,
    configured: true,
    reason: "ready",
  };
}

export function isWalletAuthConfigured() {
  return getWalletAuthConfigurationStatus().configured;
}
