function readErrorField(error: unknown, field: string) {
  if (!error || typeof error !== "object" || !(field in error)) return null;

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

export type WalletAuthSurface = "public" | "app";

export function getWalletAuthErrorMessage(
  error: unknown,
  surface: WalletAuthSurface = "public",
) {
  const fingerprint = [
    error instanceof Error ? error.message : null,
    readErrorField(error, "privyErrorCode"),
    readErrorField(error, "code"),
    readErrorField(error, "type"),
    readErrorField(error, "message"),
  ]
    .filter(Boolean)
    .join(" ");

  if (/disallowed_login_method|login with solana wallet not allowed/i.test(fingerprint)) {
    // The app client has no email path to fall back to, so it must not offer one.
    return surface === "app"
      ? "Solana wallet sign-in is temporarily unavailable. Try again in a moment."
      : "Solana wallet sign-in is temporarily unavailable. Use email or try again later.";
  }

  if (/origin.*(?:not allowed|unauthorized)|invalid origin/i.test(fingerprint)) {
    return "GWAP OS wallet sign-in is not enabled for this domain yet.";
  }

  if (/authenticated wallet session has no access token/i.test(fingerprint)) {
    return "Your wallet was verified, but the secure session was not created. Try signing in again.";
  }

  if (/sign.?message.*(?:unsupported|not supported)|does not support.*message/i.test(fingerprint)) {
    return "This wallet cannot sign the ownership message required by GWAP OS.";
  }

  if (/reject|cancel|declin|user denied|4001/i.test(fingerprint)) {
    return "The signature request was cancelled. Nothing was changed.";
  }

  return "We could not verify that wallet. Reconnect it and try again.";
}
