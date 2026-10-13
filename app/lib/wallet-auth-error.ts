function readErrorField(error: unknown, field: string) {
  if (!error || typeof error !== "object" || !(field in error)) return null;

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

function walletAuthFingerprint(error: unknown) {
  return [
    error instanceof Error ? error.message : null,
    typeof error === "string" ? error : null,
    readErrorField(error, "privyErrorCode"),
    readErrorField(error, "code"),
    readErrorField(error, "type"),
    readErrorField(error, "message"),
  ]
    .filter(Boolean)
    .join(" ");
}

export function getWalletAuthErrorCode(error: unknown) {
  const explicit =
    readErrorField(error, "privyErrorCode") ??
    readErrorField(error, "code") ??
    readErrorField(error, "type");

  if (explicit) return explicit.slice(0, 80).replace(/[^a-zA-Z0-9_.:-]/g, "_");

  const fingerprint = walletAuthFingerprint(error);
  if (/disallowed_login_method|login with solana wallet not allowed/i.test(fingerprint)) {
    return "solana_login_disabled";
  }
  if (/origin.*(?:not allowed|unauthorized)|invalid origin/i.test(fingerprint)) {
    return "origin_not_allowed";
  }
  if (/authenticated (?:wallet|account) session has no access token/i.test(fingerprint)) {
    return "session_token_missing";
  }
  if (/sign.?message.*(?:unsupported|not supported)|does not support.*message/i.test(fingerprint)) {
    return "sign_message_unsupported";
  }
  if (/reject|cancel|declin|user denied|4001/i.test(fingerprint)) {
    return "signature_rejected";
  }
  return "login_failed";
}

export function getWalletAuthErrorMessage(error: unknown) {
  const fingerprint = walletAuthFingerprint(error);

  if (/disallowed_login_method|login with solana wallet not allowed/i.test(fingerprint)) {
    return "Solana wallet sign-in is not enabled in the Privy application used by GWAP OS.";
  }

  if (/origin.*(?:not allowed|unauthorized)|invalid origin/i.test(fingerprint)) {
    return "GWAP OS sign-in is not enabled for this domain in Privy.";
  }

  if (/authenticated (?:wallet|account) session has no access token/i.test(fingerprint)) {
    return "Your sign-in was accepted, but the secure GWAP session was not created. Please retry.";
  }

  if (/sign.?message.*(?:unsupported|not supported)|does not support.*message/i.test(fingerprint)) {
    return "This wallet cannot sign the ownership message required for this wallet connection.";
  }

  if (/reject|cancel|declin|user denied|4001/i.test(fingerprint)) {
    return "The signature request was cancelled. Nothing was changed.";
  }

  return "We couldn’t complete sign-in. Check the reference below and retry.";
}
