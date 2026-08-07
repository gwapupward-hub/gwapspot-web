type ClerkKeyMode = "test" | "live";

export type ClerkConfigurationStatus = {
  configured: boolean;
  keyMode: ClerkKeyMode | null;
  reason:
    | "ready"
    | "missing_or_invalid_keys"
    | "mismatched_key_modes"
    | "production_keys_required";
};

function getKeyMode(key: string | undefined, prefix: "pk" | "sk") {
  if (!key) return null;

  const testPrefix = `${prefix}_test_`;
  const livePrefix = `${prefix}_live_`;
  if (key.startsWith(testPrefix) && key.length > testPrefix.length + 20) return "test";
  if (key.startsWith(livePrefix) && key.length > livePrefix.length + 20) return "live";
  return null;
}

export function getClerkConfigurationStatus(): ClerkConfigurationStatus {
  const publishableMode = getKeyMode(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    "pk",
  );
  const secretMode = getKeyMode(process.env.CLERK_SECRET_KEY, "sk");

  if (!publishableMode || !secretMode) {
    return {
      configured: false,
      keyMode: null,
      reason: "missing_or_invalid_keys",
    };
  }

  if (publishableMode !== secretMode) {
    return {
      configured: false,
      keyMode: null,
      reason: "mismatched_key_modes",
    };
  }

  if (process.env.VERCEL_ENV === "production" && publishableMode !== "live") {
    return {
      configured: false,
      keyMode: publishableMode,
      reason: "production_keys_required",
    };
  }

  return { configured: true, keyMode: publishableMode, reason: "ready" };
}

export function isClerkConfigured() {
  return getClerkConfigurationStatus().configured;
}
