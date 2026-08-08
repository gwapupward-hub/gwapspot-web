export type WorkspaceStorageSource = "upstash" | "vercel-kv" | "none";

export type WorkspaceStorageConfigurationStatus = {
  configured: boolean;
  source: WorkspaceStorageSource;
  urlConfigured: boolean;
  tokenConfigured: boolean;
};

export type WorkspaceStorageCredentials = {
  source: Exclude<WorkspaceStorageSource, "none">;
  url: string;
  token: string;
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
  return {
    configured: false,
    source: partial?.source ?? "none",
    urlConfigured: Boolean(partial?.url),
    tokenConfigured: Boolean(partial?.token),
  };
}

export function getWorkspaceStorageCredentials(): WorkspaceStorageCredentials | null {
  const complete = getWorkspaceStorageCandidates().find(
    (candidate) => candidate.url && candidate.token,
  );

  if (!complete?.url || !complete.token) return null;
  return {
    source: complete.source,
    url: complete.url,
    token: complete.token,
  };
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
