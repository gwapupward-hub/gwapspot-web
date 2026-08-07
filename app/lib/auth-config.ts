export type WalletAuthConfigurationStatus = {
  configured: boolean;
  authenticationConfigured: boolean;
  storageConfigured: boolean;
  reason:
    | "ready"
    | "missing_privy_configuration"
    | "missing_workspace_storage";
};

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getWalletAuthConfigurationStatus(): WalletAuthConfigurationStatus {
  const authenticationConfigured =
    hasValue(process.env.NEXT_PUBLIC_PRIVY_APP_ID) &&
    hasValue(process.env.PRIVY_APP_SECRET);
  const storageConfigured =
    hasValue(process.env.UPSTASH_REDIS_REST_URL) &&
    hasValue(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (!authenticationConfigured) {
    return {
      configured: false,
      authenticationConfigured,
      storageConfigured,
      reason: "missing_privy_configuration",
    };
  }

  if (!storageConfigured) {
    return {
      configured: false,
      authenticationConfigured,
      storageConfigured,
      reason: "missing_workspace_storage",
    };
  }

  return {
    configured: true,
    authenticationConfigured,
    storageConfigured,
    reason: "ready",
  };
}

export function isWalletAuthConfigured() {
  return getWalletAuthConfigurationStatus().configured;
}
