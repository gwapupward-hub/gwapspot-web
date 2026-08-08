function readErrorField(error: unknown, field: string) {
  if (!error || typeof error !== "object" || !(field in error)) return null;

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

export function getWalletAuthErrorMessage(error: unknown) {
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
    return "Solana wallet sign-in is temporarily unavailable. Use email or try again later.";
  }

  if (/reject|cancel|declin|user denied|4001/i.test(fingerprint)) {
    return "The signature request was cancelled. Nothing was changed.";
  }

  return "We could not verify that wallet. Reconnect it and try again.";
}
